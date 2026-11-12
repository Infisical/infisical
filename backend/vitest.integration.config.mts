import path from "path";
import { defineConfig } from "vitest/config";

// See src/domains/AGENTS.md, "Integration tests".
export default defineConfig({
  test: {
    globals: true,
    include: ["./src/**/*.integration.spec.ts"],
    globalSetup: ["./src/domains/lib/testing/integration/global-setup.ts"],
    pool: "forks",
    // The first file to need Postgres migrates the template while the others wait on it, and a server
    // image may need pulling. Both happen in beforeAll.
    hookTimeout: 5 * 60 * 1000,
    testTimeout: 30 * 1000,
    env: {
      NODE_ENV: "test",
      // Read by the migrations' own config. The same throwaway values as .env.test.example.
      ENCRYPTION_KEY: "4bnfe4e407b8921c104518903515b218",
      AUTH_SECRET: "something-random",
      TELEMETRY_ENABLED: "false",
      // A worker can exit while others still use its container, so global teardown cleans up by label.
      TESTCONTAINERS_RYUK_DISABLED: "true"
    }
  },
  resolve: {
    alias: {
      "@app": path.resolve(__dirname, "./src")
    }
  }
});
