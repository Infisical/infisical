import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    env: {
      NODE_ENV: "test"
    },
    include: ["./src/**/*.test.ts"]
  },
  resolve: {
    alias: {
      "@app": path.resolve(__dirname, "./src")
    }
  }
});
