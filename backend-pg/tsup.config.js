import { defineConfig } from "tsup";

export default defineConfig({
  shims: true,
  format: "esm",
  loader: {
    ".handlebars": "copy",
    ".md": "copy"
  },
  external: ["../../../frontend/node_modules/next/dist/server/next-server.js"],
  outDir: "dist",
  entry: ["./src"]
});
