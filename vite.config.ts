import { defineConfig, loadEnv, type UserConfig } from "vite";
import react from "@vitejs/plugin-react";
import localesPlugin from "@react-aria/optimize-locales-plugin";
export default defineConfig(({ mode }): UserConfig => {
  const env = loadEnv(mode, process.cwd(), "GIMED_");
  const target = new URL(env.GIMED_EDGE_LOCAL_URL || "http://127.0.0.1:54321/functions/v1/api");
  return {
  cacheDir: "node_modules/.vite-dev",
  plugins: [
    react(),
    { ...localesPlugin.vite({ locales: ["es-ES", "en-US"] }), enforce: "pre" },
  ],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    watch: {
      ignored: [
        "**/.playwright/**",
        "**/tests/.tmp/**",
        "**/tests/evidence/**",
      ],
    },
    proxy: mode === "legacy"
      ? { "/api": "http://127.0.0.1:3001" }
      : {
          "/api/v1": {
            target: target.origin,
            rewrite: (path) => target.pathname + path.slice(4),
            headers: { "x-gimed-proxy": env.GIMED_PROXY_SECRET ?? "" },
            changeOrigin: true,
          },
        },
  },
  };
});
