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
    "import/prefer-default-export": "off",
    "simple-import-sort/exports": "error",
    "import/first": "error",
    "import/newline-after-import": "error",
    "import/no-duplicates": "error",
    "consistent-return": "off",
    "simple-import-sort/imports": [
      "warn",
      {
        groups: [
          ["^node:", "^[a-z]", "@fastify"],
          ["^@app"],
          ["@lib"],
          ["@server"],
          ["^~(/.*|$)"],
          ["^\\.\\.(?!/?$)", "^\\.\\./?$", "^\\./(?=.*/)(?!/?$)", "^\\.(?!/?$)", "^\\./?$"]
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
