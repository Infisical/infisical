import tsconfigPaths from "vite-tsconfig-paths"; // only if you are using custom tsconfig paths
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "./e2e-test/vitest-environment-knex.ts",
    include: ["./e2e-test/**/*.spec.ts"],
    poolOptions: {
      threads: {
        singleThread: true,
        useAtomics: true
      }
    }
  },
  plugins: [tsconfigPaths()] // only if you are using custom tsconfig paths,
});
