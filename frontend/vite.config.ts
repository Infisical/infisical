import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, loadEnv, PluginOption } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";
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

// Locale files are served from public/ without a content hash, and the server caches static files
// as immutable for 30 days, so the loader URL carries this hash to pick up new translations.
const hashLocales = () => {
  const localesDir = join(process.cwd(), "public/locales");
  const hash = createHash("sha256");
  readdirSync(localesDir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .sort()
    .forEach((file) => hash.update(file.slice(localesDir.length)).update(readFileSync(file)));
  return hash.digest("hex").slice(0, 12);
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
    define: {
      "import.meta.env.VITE_LOCALES_VERSION": JSON.stringify(hashLocales())
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
      target: ["es2020", "edge88", "firefox78", "chrome87", "safari14"],
      cssTarget: ["edge88", "firefox78", "chrome87", "safari14"],
      rolldownOptions: {
        output: {
          entryFileNames: `assets/[name]-${version}-[hash].js`,
          chunkFileNames: `assets/[name]-${version}-[hash].js`,
          assetFileNames: `assets/[name]-${version}-[hash].[ext]`,
          // recharts/d3 has circular dependencies so we ensure
          // they remain in the same chunk so that the import resolution
          // doesn't lead to uninitailized import sequences
          manualChunks(id) {
            if (
              id.includes("node_modules/recharts") ||
              id.includes("node_modules/d3-") ||
              id.includes("node_modules/victory-vendor")
            ) {
              return "recharts";
            }

            return undefined;
          }
        }
      }
    },
    optimizeDeps: {
      // Deps that the initial dependency scan can't reach: `react/jsx-runtime` is injected by the
      // JSX transform (the scanner reads pre-transform source), and the rest are only imported
      // from lazy route components. Discovering them mid-session re-runs optimizeDeps, which
      // rotates the ?v= hash on every /node_modules/.vite/deps URL and force-reloads the page.
      include: [
        "react/jsx-runtime",
        "crypto",
        "react-icons/bs",
        "react-icons/di",
        "react-icons/si",
        "react-icons/vsc",
        "@fortawesome/free-brands-svg-icons",
        "@fortawesome/free-regular-svg-icons"
      ]
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
      tsconfigPaths(),
      nodePolyfills({
        globals: {
          Buffer: true
        }
      }),
      wasm(),
      TanStackRouterVite({
        virtualRouteConfig: "./src/routes.ts"
      }),
      react(),
      virtualRouteFileChangeReloadPlugin
    ]
  };
});
