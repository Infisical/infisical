import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import { nodePolyfills } from "vite-plugin-node-polyfills";

// https://vite.dev/config/
export default defineConfig({
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
        secure: false,
        ws: true
      }
    }
  },
  plugins: [
    tsconfigPaths(),
    nodePolyfills({
      globals: {
        Buffer: true
      }
    }),
    wasm(),
    topLevelAwait(),
    TanStackRouterVite(),
    react()
  ]
});
