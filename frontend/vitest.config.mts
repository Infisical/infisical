import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["./src/**/*.{test,spec}.{ts,tsx}"]
  },
  resolve: {
    alias: {
      "@app": path.resolve(import.meta.dirname, "./src")
    }
  }
});
