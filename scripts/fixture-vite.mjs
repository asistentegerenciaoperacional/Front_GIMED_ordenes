import { join, resolve } from "node:path";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

export function createFixtureVite({
  temporary,
  root = resolve("."),
  server = {},
}) {
  return createServer({
    configFile: false,
    root,
    cacheDir: join(temporary, "vite-cache"),
    plugins: [react()],
    server: {
      host: "127.0.0.1",
      port: 0,
      watch: {
        ignored: [
          "**/.playwright/**",
          "**/tests/.tmp/**",
          "**/tests/evidence/**",
        ],
      },
      ...server,
    },
    logLevel: "error",
  });
}
