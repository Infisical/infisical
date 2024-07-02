/* eslint-disable */
import path from "node:path";

import fs from "fs/promises";
import { replaceTscAliasPaths } from "tsc-alias";
import { defineConfig } from "tsup";

// Instead of using tsx or tsc for building, consider using tsup.
// TSX serves as an alternative to Node.js, allowing you to build directly on the Node.js runtime.
// Its functionality mirrors Node.js, with the only difference being the absence of a final build step. Production should ideally be launched with TSX.
// TSC is effective for creating a final build, but it requires manual copying of all static files such as handlebars, emails, etc.
// A significant challenge is the shift towards ESM, as more packages are adopting ESM. If the output is in CommonJS, it may lead to errors.
// The suggested configuration offers a balance, accommodating both ESM and CommonJS requirements.

export default defineConfig({
  shims: true,
  clean: true,
  minify: false,
  keepNames: true,
  splitting: true,
  // copy the files to output
  loader: {
    ".handlebars": "copy",
    ".md": "copy",
    ".txt": "copy",
    ".pem": "copy"
  },
  external: ["../../../frontend/node_modules/next/dist/server/next-server.js"],
  outDir: "dist",
  tsconfig: "./tsconfig.json",
  entry: ["./src"],
  sourceMap: true,
  skipNodeModulesBundle: true,

  async onSuccess() {
    // this will replace all tsconfig paths
    await replaceTscAliasPaths({
      configFile: "tsconfig.json",
      watch: false,
      outDir: "dist"
    });
  }
});
