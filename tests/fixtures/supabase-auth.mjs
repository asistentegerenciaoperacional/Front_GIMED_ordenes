import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

export const authTestPassword = "local-test-password";
export const authTestAccounts = [
  {
    id: "3d001072-9b84-4437-bf28-4db46d6111ce",
    email: "ana@example.com",
    user_metadata: { name: "Ana" },
  },
  {
    id: "6003363a-d535-490e-a88c-8564ce4c8450",
    email: "jorge@example.com",
    user_metadata: { name: "Jorge" },
  },
  {
    id: "cd8dd730-6460-4229-8daf-b8f41de5d126",
    email: "externo@example.com",
    user_metadata: { name: "Externo" },
  },
];

export async function startAuthFixture() {
  const refreshTokens = new Map();
  const accessTokens = new Map();
  const fixture = {
    expiresIn: 3600,
    refreshes: 0,
    revokeRefreshTokens: () => refreshTokens.clear(),
  };
  const server = createServer(async (req, res) => {
    function json(status, payload) {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(payload));
    }
    if (
      req.method !== "POST" ||
      req.headers.apikey !== "fixture-publishable-key"
    ) {
      json(403, {});
      return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length
      ? JSON.parse(Buffer.concat(chunks).toString())
      : {};
    let user;
    if (req.url === "/auth/v1/token?grant_type=password") {
      user =
        body.password === authTestPassword &&
        authTestAccounts.find((account) => account.email === body.email);
    } else if (req.url === "/auth/v1/token?grant_type=refresh_token") {
      fixture.refreshes++;
      user = refreshTokens.get(body.refresh_token);
      refreshTokens.delete(body.refresh_token);
    } else if (req.url === "/auth/v1/logout?scope=local") {
      const access = req.headers.authorization?.replace(/^Bearer /, "");
      refreshTokens.delete(accessTokens.get(access));
      res.writeHead(204).end();
      return;
    }
    if (!user) {
      json(400, {});
      return;
    }
    const access_token = randomUUID();
    const refresh_token = randomUUID();
    refreshTokens.set(refresh_token, user);
    accessTokens.set(access_token, refresh_token);
    json(200, {
      access_token,
      refresh_token,
      expires_in: fixture.expiresIn,
      user,
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return Object.assign(fixture, {
    env: {
      SUPABASE_URL: `http://127.0.0.1:${server.address().port}`,
      SUPABASE_PUBLISHABLE_KEY: "fixture-publishable-key",
      PROTOTIPO_AUTH_USER_IDS: authTestAccounts
        .slice(0, 2)
        .map((user) => user.id)
        .join(","),
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  });
}

export function authTestLogin(
  api,
  account = authTestAccounts[0],
  password = authTestPassword,
) {
  return api.post("/api/auth/login", {
    data: { email: account.email, password },
  });
}
