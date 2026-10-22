import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import localesPlugin from "@react-aria/optimize-locales-plugin";
export default defineConfig({
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
    proxy: { "/api": "http://127.0.0.1:3001" },
  },
});
