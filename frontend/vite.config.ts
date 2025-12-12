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
  const version = (
    env.INFISICAL_PLATFORM_VERSION ||
    env.VITE_INFISICAL_PLATFORM_VERSION ||
    "0.0.1"
  ).replaceAll(".", "-");

  // CDN URL for static assets in /assets/* only.
  // Docker: Set CDN_URL env var at runtime (placeholder replaced at container startup).
  // Direct build: Use --build-arg CDN_URL=https://... or VITE_CDN_URL env var.
  // Default: Empty = same-origin asset loading.
  const cdnUrl = env.VITE_CDN_URL || "";

  return {
    base: "/",
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
    build: {
      rollupOptions: {
        output: {
          entryFileNames: `assets/[name]-${version}-[hash].js`,
          chunkFileNames: `assets/[name]-${version}-[hash].js`,
          assetFileNames: `assets/[name]-${version}-[hash].[ext]`
        }
      }
    },
    experimental: {
      // Only apply CDN URL to files in /assets/* directory
      renderBuiltUrl(filename) {
        if (filename.startsWith("assets/") && cdnUrl) {
          return `${cdnUrl}/${filename}`;
        }
        return `/${filename}`;
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
      TanStackRouterVite({
        virtualRouteConfig: "./src/routes.ts"
      }),
      react(),
      virtualRouteFileChangeReloadPlugin
    ]
  };
});
