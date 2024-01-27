export default {
  preset: "ts-jest",
  testEnvironment: "node",
  collectCoverageFrom: ["src/*.{js,ts}", "!**/node_modules/**"],
  modulePaths: ["<rootDir>/src"],
  testMatch: ["<rootDir>/tests/**/*.test.ts"],
  setupFiles: ["<rootDir>/test-resources/env-vars.js"],
  setupFilesAfterEnv: ["<rootDir>/tests/setupTests.ts"],
};
