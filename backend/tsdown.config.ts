import path from "node:path";

import { defineConfig } from "tsdown";

// Object entries must be absolute: tsdown ignores `root` for them and takes the output root from
// the entries' common ancestor, so a relative path would nest every other module under dist/src/.
const src = (file: string) => path.resolve("src", file);

export default defineConfig({
  // main must stay first. Rolldown orders each file's imports by execution order, walking the
  // entries in order, so a glob that sorts another entry ahead of main moves its imports above
  // the telemetry instrumentation import.
  entry: {
    main: src("main.ts"),
    "db/knexfile": src("db/knexfile.ts"),
    "db/auditlog-knexfile": src("db/auditlog-knexfile.ts"),
    "db/rename-migrations-to-mjs": src("db/rename-migrations-to-mjs.ts"),
    "db/run-clickhouse-migrations": src("db/run-clickhouse-migrations.ts"),
    "db/migrations/*": "src/db/migrations/*.ts",
    "db/manual-migrations/*": "src/db/manual-migrations/*.ts",
    "db/seeds/*": "src/db/seeds/*.ts"
  },
  unbundle: true,
  format: "esm",
  // knex records each migration's file name, extension included, so production rows depend on .mjs.
  fixedExtension: true,
  platform: "node",
  target: "node26",
  outDir: "dist",
  tsconfig: "./tsconfig.json",
  dts: false,
  sourcemap: true,
  shims: true,
  report: false,
  deps: { onlyBundle: [] },
  outputOptions: { keepNames: true },
  copy: [
    { from: "src/**/*.{pem,yaml,txt}", to: "dist", flatten: false },
    { from: "src/ee/LICENSE.md", to: "dist/ee" }
  ]
});
