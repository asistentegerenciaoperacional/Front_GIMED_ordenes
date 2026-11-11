import { randomBytes } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import type { usuario } from "../shared/models";
import type { JsonStore } from "./store";

const credentialsSchema = z
  .object({
    email: z.email().max(254),
    password: z.string().min(1).max(1024),
  })
  .strict();
const tokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().positive(),
  user: z.object({
    id: z.uuid(),
    email: z.string().optional(),
    user_metadata: z
      .object({ full_name: z.string().optional(), name: z.string().optional() })
      .optional(),
  }),
});
type Tokens = z.infer<typeof tokenSchema>;
type Session = {
  user: usuario;
  tokens: Tokens;
  expiresAt: number;
  lastUse: number;
  refresh?: Promise<boolean>;
};

const cookie = "gimed_session";
const idleTime = 12 * 60 * 60 * 1000;
const cookieOptions = {
  httpOnly: true,
  sameSite: "strict" as const,
  path: "/api",
};

function sessionId(req: Request): string | undefined {
  return /(?:^|;\s*)gimed_session=([\da-f]{64})(?:;|$)/.exec(
    req.headers.cookie ?? "",
  )?.[1];
}

function failure(res: Response, status: number, code: string, message: string) {
  res.status(status).json({ code, message });
}

export function createAuth(
  store: JsonStore,
  env: NodeJS.ProcessEnv = process.env,
) {
  const key = env.SUPABASE_PUBLISHABLE_KEY?.trim();
  const configuredUrl = env.SUPABASE_URL?.trim();
  const base = configuredUrl ? new URL(configuredUrl) : undefined;
  if (
    base &&
    base.protocol !== "https:" &&
    !(
      base.protocol === "http:" &&
      ["127.0.0.1", "localhost", "[::1]"].includes(base.hostname)
    )
  )
    throw new Error("SUPABASE_URL debe usar HTTPS o una instancia local.");
  const allowed = new Set(
    (env.PROTOTIPO_AUTH_USER_IDS ?? "")
      .split(",")
      .map((id) => id.trim().toLowerCase())
      .filter(Boolean),
  );
  for (const id of allowed)
    if (!z.uuid().safeParse(id).success)
      throw new Error("PROTOTIPO_AUTH_USER_IDS contiene un UUID inválido.");

  const sessions = new Map<string, Session>();
  const expiry = (tokens: Tokens) => Date.now() + tokens.expires_in * 1000;
  const unavailable = (res: Response) =>
    failure(
      res,
      503,
      "AUTH_UNAVAILABLE",
      "No se pudo conectar con el servicio de inicio de sesión. Inténtalo de nuevo.",
    );

  async function provider(path: string, data?: object, accessToken?: string) {
    return fetch(new URL(`/auth/v1/${path}`, base), {
      method: "POST",
      headers: {
        apikey: key!,
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: data ? JSON.stringify(data) : undefined,
      signal: AbortSignal.timeout(8000),
    });
  }

  function verifyOrigin(req: Request, res: Response, next: NextFunction) {
    const host = req.get("host") ?? "";
    const origin = req.get("origin");
    const expected = `${req.protocol}://${host}`;
    if (
      !/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host) ||
      (origin && origin !== expected) ||
      req.get("sec-fetch-site") === "cross-site"
    ) {
      failure(
        res,
        403,
        "AUTH_ORIGIN",
        "El origen de la solicitud no está autorizado.",
      );
      return;
    }
    res.set("Cache-Control", "no-store");
    next();
  }

  async function login(req: Request, res: Response) {
    if (!base || !key || !allowed.size) {
      failure(
        res,
        503,
        "AUTH_CONFIGURATION",
        "El inicio de sesión requiere configurar Supabase y los usuarios autorizados en el servicio local.",
      );
      return;
    }
    const input = credentialsSchema.safeParse(req.body);
    if (!input.success) {
      failure(res, 400, "AUTH_INPUT", "Ingresa tu correo y contraseña.");
      return;
    }
    let tokens: Tokens;
    try {
      const response = await provider("token?grant_type=password", input.data);
      if (!response.ok) {
        if (response.status >= 500 || response.status === 429) unavailable(res);
        else
          failure(
            res,
            401,
            "INVALID_CREDENTIALS",
            "No se pudo iniciar sesión con esas credenciales.",
          );
        return;
      }
      tokens = tokenSchema.parse(await response.json());
    } catch {
      unavailable(res);
      return;
    }
    const id = tokens.user.id.toLowerCase();
    if (!allowed.has(id)) {
      failure(
        res,
        403,
        "AUTH_FORBIDDEN",
        "Esta cuenta no tiene acceso a GIMED.",
      );
      return;
    }
    const nombre =
      [
        tokens.user.user_metadata?.full_name,
        tokens.user.user_metadata?.name,
        tokens.user.email?.split("@")[0],
      ]
        .find((value) => value?.trim())
        ?.trim()
        .slice(0, 160) ?? "Usuario";
    const user = { id, nombre };
    await store.transaction((db) => {
      const saved = db.usuario.find((profile) => profile.id === id);
      if (saved) saved.nombre = nombre;
      else db.usuario.push(user);
    });
    const now = Date.now();
    for (const [sid, session] of sessions)
      if (session.lastUse + idleTime <= now) sessions.delete(sid);
    const previous = sessionId(req);
    if (previous) sessions.delete(previous);
    const sid = randomBytes(32).toString("hex");
    sessions.set(sid, {
      user,
      tokens,
      expiresAt: expiry(tokens),
      lastUse: now,
    });
    res.cookie(cookie, sid, { ...cookieOptions, secure: req.secure });
    res.json({ usuario: user });
  }

  async function refresh(session: Session) {
    const response = await provider("token?grant_type=refresh_token", {
      refresh_token: session.tokens.refresh_token,
    });
    if (!response.ok) {
      if ([400, 401, 403].includes(response.status)) return false;
      throw new Error("Supabase Auth no respondió a la renovación.");
    }
    const tokens = tokenSchema.parse(await response.json());
    if (tokens.user.id.toLowerCase() !== session.user.id) return false;
    session.tokens = tokens;
    session.expiresAt = expiry(tokens);
    return true;
  }

  async function requireSession(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    const sid = sessionId(req);
    const session = sid && sessions.get(sid);
    if (
      session &&
      allowed.has(session.user.id) &&
      session.lastUse + idleTime > Date.now()
    ) {
      try {
        if (session.expiresAt - 15000 <= Date.now()) {
          session.refresh ??= refresh(session).finally(() => {
            session.refresh = undefined;
          });
          if (!(await session.refresh)) sessions.delete(sid);
        }
        if (sessions.get(sid) === session) {
          session.lastUse = Date.now();
          res.locals.usuario = session.user;
          next();
          return;
        }
      } catch {
        unavailable(res);
        return;
      }
    }
    if (sid) sessions.delete(sid);
    res.clearCookie(cookie, { ...cookieOptions, secure: req.secure });
    failure(res, 401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
  }

  async function logout(req: Request, res: Response) {
    const sid = sessionId(req);
    const session = sid ? sessions.get(sid) : undefined;
    if (sid) sessions.delete(sid);
    res.clearCookie(cookie, { ...cookieOptions, secure: req.secure });
    res.json({ ok: true });
    if (session) {
      await session.refresh?.catch(() => undefined);
      await provider(
        "logout?scope=local",
        undefined,
        session.tokens.access_token,
      ).catch(() => undefined);
    }
  }

  return { verifyOrigin, login, requireSession, logout };
}
