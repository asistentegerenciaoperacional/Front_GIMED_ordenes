import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { authTestAccounts, startAuthFixture } from "../tests/fixtures/supabase-auth.mjs";

try {
  await access(new URL("../dist/index.html", import.meta.url));
} catch {
  throw new Error("Compila el prototipo con npm run build antes de iniciar la demostración.");
}

const auth = await startAuthFixture();
Object.assign(process.env, auth.env, {
  PROTOTIPO_AUTH_USER_IDS: authTestAccounts[0].id,
  PROTOTIPO_API_PORT: process.env.PROTOTIPO_DEMO_PORT ?? "3002",
  PROTOTIPO_DATA_FILE: fileURLToPath(new URL("../tests/.tmp/demo-auth/database.json", import.meta.url)),
});

try {
  await import("../server/index.ts");
} catch (error) {
  await auth.close();
  throw error;
}
