export default [{
  files: ["**/*.mjs"],
  languageOptions: { ecmaVersion: "latest", sourceType: "module" },
  rules: {
    "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrors: "none" }],
    "no-unreachable": "error",
    "no-constant-condition": "error",
    "no-duplicate-imports": "error",
    "constructor-super": "error"
  }
}];
