/* eslint-disable */
import path from "node:path";

import fs from "fs/promises";
import { replaceTscAliasPaths } from "tsc-alias";
import { defineConfig } from "tsup";

// what you need tsup to build instead of tsx or tsc
// tsx is a drop in replacement for nodejs - rather build on top of nodejs runtime
// it works exactly like node only catch is it doesn't have a final build step else prod should be started with tsx
// tsc is great for final build issue is we need to then do a manual copy of all static files like handlebar email etc
// another issue is commonjs. final output needs to be esm because more and more packages are migrating to esm
// if the final output is commonjs it will just throw an error
// the below configuration is best of both worlds
export default defineConfig({
  shims: true,
  clean: true,
  minify: false,
  keepNames: true,
  splitting: false,
  format: "esm",
  // copy the files to output
  loader: {
    ".handlebars": "copy",
    ".md": "copy",
    ".txt": "copy"
  },
  external: ["../../../frontend/node_modules/next/dist/server/next-server.js"],
  outDir: "dist",
  tsconfig: "./tsconfig.json",
  entry: ["./src"],
  sourceMap: true,
  skipNodeModulesBundle: true,
  esbuildPlugins: [
    {
      // esm directory import are not allowed
      // /folder1 should be explicitly imported as /folder1/index.ts
      // this plugin will append it automatically on build time to all imports
      name: "commonjs-esm-directory-import",
      setup(build) {
        build.onResolve({ filter: /.*/ }, async (args) => {
          if (args.importer) {
            if (args.kind === "import-statement") {
              const isRelativePath = args.path.startsWith(".");
              const absPath = isRelativePath
                ? path.join(args.resolveDir, args.path)
                : path.join(args.path.replace("@app", "./src"));

              const isFile = await fs
                .stat(`${absPath}.ts`)
                .then((el) => el.isFile)
                .catch((err) => err.code === "ENOTDIR");

              return {
                path: isFile ? `${args.path}.mjs` : `${args.path}/index.mjs`,
                external: true
              };
            }
          }
          return undefined;
        });
      }
    }
  ],
  async onSuccess() {
    // this will replace all tsconfig paths
    await replaceTscAliasPaths({
      configFile: "tsconfig.json",
      watch: false,
      outDir: "dist"
    });
  }
});
