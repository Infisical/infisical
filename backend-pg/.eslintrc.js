module.exports = {
  root: true,
  env: {
    browser: true,
    es2021: true
  },
  extends: ["airbnb-base", "airbnb-typescript/base", "prettier"],
  plugins: ["prettier", "simple-import-sort", "import"],
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    project: "./tsconfig.json",
    tsconfigRootDir: __dirname
  },
  rules: {
    "consistent-return": "off", // my style
    "import/order": "off", // for simple-import-order
    "import/prefer-default-export": "off", // why
    "no-restricted-syntax": "off",
    "import/first": "error",
    "import/newline-after-import": "error",
    "import/no-duplicates": "error",
    "simple-import-sort/exports": "error",
    "simple-import-sort/imports": [
      "warn",
      {
        groups: [
          // Side effect imports.
          ["^\\u0000"],
          // Node.js builtins prefixed with `node:`.
          ["^node:"],
          // Packages.
          // Things that start with a letter (or digit or underscore), or `@` followed by a letter.
          ["^@?\\w"],
          ["^@app"],
          ["@lib"],
          ["@server"],
          // Absolute imports and other imports such as Vue-style `@/foo`.
          // Anything not matched in another group.
          ["^"],
          // Relative imports.
          // Anything that starts with a dot.
          ["^\\."]
        ]
      }
    ]
  },
  settings: {
    "import/resolver": {
      typescript: {
        project: ["./tsconfig.json"]
      }
    }
  }
};
