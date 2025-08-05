import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    env: {
      NODE_ENV: "test"
    },
    environment: "./e2e-test/vitest-environment-knex.ts",
    include: ["./e2e-test/**/secret-rotations.spec.ts"],

    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
        isolate: false
      }
    },
    isolate: false,
    fileParallelism: false,

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
