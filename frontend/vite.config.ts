import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, PluginOption } from "vite";

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

  return {
    resolve: {
      tsconfigPaths: true
    },
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
      // Keep the Vite 6 browser floor while the build tool changes independently.
      target: ["es2020", "chrome87", "edge88", "firefox78", "safari14"],
      rolldownOptions: {
        output: {
          entryFileNames: `assets/[name]-${version}-[hash].js`,
          chunkFileNames: `assets/[name]-${version}-[hash].js`,
          assetFileNames: `assets/[name]-${version}-[hash].[ext]`,
          // Recharts and D3 contain order-sensitive cycles and must execute in one chunk.
          codeSplitting: {
            groups: [
              {
                name: "recharts",
                test: /node_modules[\\/](?:recharts|d3-|victory-vendor)/,
                priority: 10
              },
              // Preserve Vite 6's grouped entry graph instead of preloading ~100 startup chunks.
              {
                name: "initial",
                tags: ["$initial"]
              }
            ]
          }
        }
      }
    },
    experimental: {
      renderBuiltUrl(filename, { hostType }) {
        if (hostType === "js") {
          const fallback = 'function(f){ return "/" + f; }';
          const fn = `(typeof window.__toCdnUrl === "function" ? window.__toCdnUrl : ${fallback})`;
          return { runtime: `${fn}(${JSON.stringify(filename)})` };
        }
        return { relative: true };
      }
    },
    plugins: [
      tanstackRouter({
        target: "react",
        virtualRouteConfig: "./src/routes.ts"
      }),
      react(),
      virtualRouteFileChangeReloadPlugin
    ]
  };
});
