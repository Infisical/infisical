import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    env: {
      NODE_ENV: "test",
      E2E_TEST_ORACLE_DB_HOST: process.env.E2E_TEST_ORACLE_DB_HOST!,
      E2E_TEST_ORACLE_DB_USERNAME: process.env.E2E_TEST_ORACLE_DB_USERNAME!,
      E2E_TEST_ORACLE_DB_PASSWORD: process.env.E2E_TEST_ORACLE_DB_PASSWORD!
    },
    environment: "./e2e-test/vitest-environment-knex.ts",
    include: ["./e2e-test/**/*.spec.ts"],
    poolOptions: {
      threads: {
        singleThread: true,
        useAtomics: true,
        isolate: false
      }
    },
    alias: {
      "./license-fns": path.resolve(__dirname, "./src/ee/services/license/__mocks__/license-fns")
    }
  },
  resolve: {
    alias: {
      "@app": path.resolve(__dirname, "./src")
    }
  }
});
