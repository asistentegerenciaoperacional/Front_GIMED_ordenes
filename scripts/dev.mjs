import { spawn } from "node:child_process";
const launch = (entry, args) =>
  spawn(process.execPath, [entry, ...args], {
    stdio: "inherit",
    env: process.env,
  });
const api = launch("node_modules/tsx/dist/cli.mjs", [
  "watch",
  "server/index.ts",
]);
const web = launch("node_modules/vite/bin/vite.js", []);
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  api.kill();
  web.kill();
  setTimeout(() => process.exit(code), 250);
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
api.on("exit", (code) => stop(code ?? 1));
web.on("exit", (code) => stop(code ?? 1));
