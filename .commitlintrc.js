module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // ensure commits always has a scope -> <type>(scope): msg
    // this helps in filtering changelogs based on tools
    "scope-enum": [
      2,
      "always",
      ["cli", "ui", "api", "operator", "docs", "helm"],
    ],
  },
};
