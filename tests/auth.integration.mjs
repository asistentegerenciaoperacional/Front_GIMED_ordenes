import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp } from "node:fs/promises";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  authTestAccounts,
  authTestPassword,
  startAuthFixture,
} from "./fixtures/supabase-auth.mjs";

test("API protegida, sesión renovable y autoría de comentarios", async (t) => {
  const auth = await startAuthFixture();
  t.after(() => auth.close());
  await mkdir("tests/.tmp", { recursive: true });
  const directory = await mkdtemp(resolve("tests/.tmp/auth-"));
  const socket = createServer();
  socket.listen(0, "127.0.0.1");
  await once(socket, "listening");
  const { port } = socket.address();
  socket.close();
  await once(socket, "close");
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "server/index.ts"],
    {
      env: {
        ...process.env,
        ...auth.env,
        PROTOTIPO_API_PORT: String(port),
        PROTOTIPO_DATA_FILE: join(directory, "database.json"),
      },
      stdio: ["ignore", "pipe", "inherit"],
      windowsHide: true,
    },
  );
  t.after(() => child.kill());
  await once(child.stdout, "data", { signal: AbortSignal.timeout(10000) });
  const base = `http://127.0.0.1:${port}/api/`;
  const document = "documents/0000000000000000000000aa/content";
  const get = (path, cookie) =>
    fetch(base + path, { headers: cookie ? { cookie } : {} });
  const post = (path, data, cookie, origin) =>
    fetch(base + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { cookie } : {}),
        ...(origin ? { origin } : {}),
      },
      body: JSON.stringify(data),
    });
  const login = (index, password = authTestPassword) =>
    post("auth/login", { email: authTestAccounts[index].email, password });
  const getCookie = async (response, account) => {
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      usuario: { id: account.id, nombre: account.user_metadata.name },
    });
    const header = response.headers.get("set-cookie");
    assert.match(header, /HttpOnly/);
    assert.match(header, /SameSite=Strict/);
    return header.split(";")[0];
  };

  assert.equal((await get("state")).status, 401);
  assert.equal((await get(document)).status, 401);
  assert.equal((await login(0, "incorrecta")).status, 401);
  assert.equal((await login(2)).status, 403);
  auth.expiresIn = 1;
  const first = await getCookie(await login(0), authTestAccounts[0]);
  auth.expiresIn = 3600;
  const concurrent = await Promise.all([
    get("state", first),
    get(document, first),
    get("auth/session", first),
  ]);
  assert.deepEqual(
    concurrent.map((res) => res.status),
    [200, 200, 200],
  );
  assert.equal(auth.refreshes, 1);
  const second = await getCookie(await login(1), authTestAccounts[1]);
  const line = { tipo: "producto", id: "00000000000000000000006e" };
  assert.equal(
    (
      await post(
        "comentarios",
        { ...line, texto: "Falso", id_usuario: authTestAccounts[1].id },
        first,
      )
    ).status,
    422,
  );
  assert.equal(
    (
      await post(
        "comentarios",
        { ...line, texto: "Falso", fecha_creacion: new Date().toISOString() },
        first,
      )
    ).status,
    422,
  );
  assert.equal(
    (
      await post(
        "comentarios",
        { ...line, texto: "Origen ajeno" },
        first,
        "https://example.com",
      )
    ).status,
    403,
  );
  for (const [cookie, account] of [
    [first, authTestAccounts[0]],
    [second, authTestAccounts[1]],
  ]) {
    const response = await post(
      "comentarios",
      { ...line, texto: "Seguimiento" },
      cookie,
    );
    assert.equal(response.status, 201);
    const saved = await response.json();
    assert.equal(saved.id_usuario, account.id);
    assert.ok(Number.isFinite(Date.parse(saved.fecha_creacion)));
  }
  const history = await (
    await get(`comentarios/${line.tipo}/${line.id}`, second)
  ).json();
  assert.deepEqual(
    new Set(history.map((comment) => comment.autor)),
    new Set(["Ana", "Jorge"]),
  );
  assert.equal((await post("auth/logout", {}, first)).status, 200);
  assert.equal((await get("state", first)).status, 401);
  auth.expiresIn = 1;
  const expired = await getCookie(await login(0), authTestAccounts[0]);
  auth.revokeRefreshTokens();
  assert.equal((await get("state", expired)).status, 401);
});
