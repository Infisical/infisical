import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react-swc";
import { defineConfig, loadEnv, PluginOption } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import topLevelAwait from "vite-plugin-top-level-await";
import wasm from "vite-plugin-wasm";
import tsconfigPaths from "vite-tsconfig-paths";

const virtualRouteFileChangeReloadPlugin: PluginOption = {
  name: "watch-config-restart",
  configureServer(server) {
    server.watcher.add("./src/routes.ts");
    server.watcher.on("change", (path) => {
      if (path.endsWith("src/routes.ts")) {
        console.log("Virtual route changed");
        server.restart();
      }
    });
  }
};

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());
  const allowedHosts = env.VITE_ALLOWED_HOSTS?.split(",") ?? [];

  return {
    server: {
      allowedHosts,
      host: true,
      port: 3000
      // proxy: {
      //   "/api": {
      //     target: "http://localhost:8080",
      //     changeOrigin: true,
      //     secure: false,
      //     ws: true
      //   }
      // }
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
      TanStackRouterVite({
        virtualRouteConfig: "./src/routes.ts"
      }),
      react(),
      virtualRouteFileChangeReloadPlugin
    ]
  };
});
