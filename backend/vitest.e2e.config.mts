import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    env: {
      NODE_ENV: "test",
      E2E_TEST_ORACLE_DB_19_HOST: process.env.E2E_TEST_ORACLE_DB_19_HOST!,
      E2E_TEST_ORACLE_DB_19_USERNAME: process.env.E2E_TEST_ORACLE_DB_19_USERNAME!,
      E2E_TEST_ORACLE_DB_19_PASSWORD: process.env.E2E_TEST_ORACLE_DB_19_PASSWORD!,
      E2E_TEST_ORACLE_DB_19_DATABASE: process.env.E2E_TEST_ORACLE_DB_19_DATABASE!
    },
    environment: "./e2e-test/vitest-environment-knex.ts",
    include: ["./e2e-test/**/*.spec.ts"],
    pool: "threads",
    poolOptions: {
      threads: {
        minThreads: 1,
        maxThreads: 1,
        singleThread: true
      }
    },
    fileParallelism: false,

    alias: {
      "./license-fns": path.resolve(__dirname, "./src/ee/services/license/__mocks__/license-fns")
    }
  },
  resolve: {
    alias: {
      "@app": path.resolve(__dirname, "./src"),
      "@bdd_routes/bdd-nock-router": path.resolve(__dirname, "./src/server/routes/bdd/bdd-nock-router.dev.ts")
    }
  }
});
