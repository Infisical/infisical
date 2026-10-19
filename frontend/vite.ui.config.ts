import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const workbenchEntry = (): Plugin => {
  const rewrite = (request: { url?: string }, _response: unknown, next: () => void) => {
    if (request.url === "/" || request.url?.split("?")[0] === "/design-system") {
      request.url = "/ui.html";
    }
    next();
  };
  return {
    name: "ui-workbench-entry",
    configureServer(server) {
      server.middlewares.use(rewrite);
    },
    configurePreviewServer(server) {
      server.middlewares.use(rewrite);
    }
  };
};

export default defineConfig({
  define: { "import.meta.env.VITE_TELEMETRY_CAPTURING_ENABLED": "false" },
  plugins: [react(), workbenchEntry()],
  resolve: { alias: { "@app": path.resolve(import.meta.dirname, "src") } },
  server: { host: "127.0.0.1", port: 3020, strictPort: true },
  preview: { host: "127.0.0.1", port: 3021, strictPort: true },
  build: {
    outDir: "dist-ui",
    rolldownOptions: { input: path.resolve(import.meta.dirname, "ui.html") }
  }
});
