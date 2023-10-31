module.exports = {
  overrides: [
    {
      files: ["next.config.js"]
    }
  ],
  root: true,
  env: {
    browser: true,
    es2021: true,
    es6: true
  },
  extends: [
    "airbnb",
    "airbnb-typescript",
    "airbnb/hooks",
    "plugin:react/recommended",
    "prettier",
    "plugin:storybook/recommended"
  ],
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    project: "./tsconfig.json",
    ecmaFeatures: {
      jsx: true
    },
    tsconfigRootDir: __dirname
  },
  plugins: ["react", "prettier", "simple-import-sort", "import"],
  rules: {
    quotes: ["error", "double", { avoidEscape: true }],
    "comma-dangle": ["error", "only-multiline"],
    "react/react-in-jsx-scope": "off",
    "import/prefer-default-export": "off",
    "react-hooks/exhaustive-deps": "off",
    "@typescript-eslint/ban-ts-comment": "warn",
    "react/jsx-props-no-spreading": "off", // switched off for component building
    // TODO: This rule will be switched ON after complete revamp of frontend
    "@typescript-eslint/no-explicit-any": "off",
    "no-console": "off",
    "arrow-body-style": "off",
    "no-underscore-dangle": [
      "error",
      {
        allow: ["_id"]
      }
    ],
    "jsx-a11y/anchor-is-valid": "off",
    // all those <a> tags must be converted to label or a p component
    //
    "react/require-default-props": "off",
    "react/jsx-filename-extension": [
      1,
      {
        extensions: [".tsx", ".ts"]
      }
    ],
    // TODO: turn this rule ON after migration. everything should use arrow functions
    "react/function-component-definition": [
      0,
      {
        namedComponents: "arrow-function"
      }
    ],
    "react/no-unknown-property": [
      "error",
      {
        ignore: ["jsx"]
      }
    ],
    "@typescript-eslint/no-non-null-assertion": "off",
    "simple-import-sort/exports": "warn",
    "@typescript-eslint/no-empty-function": "off",
    "simple-import-sort/imports": [
      "warn",
      {
        groups: [
          // Node.js builtins. You could also generate this regex if you use a `.js` config.
          // For example: `^(${require("module").builtinModules.join("|")})(/|$)`
          // Note that if you use the `node:` prefix for Node.js builtins,
          // you can avoid this complexity: You can simply use "^node:".
          [
            "^(assert|buffer|child_process|cluster|console|constants|crypto|dgram|dns|domain|events|fs|http|https|module|net|os|path|punycode|querystring|readline|repl|stream|string_decoder|sys|timers|tls|tty|url|util|vm|zlib|freelist|v8|process|async_hooks|http2|perf_hooks)(/.*|$)"
          ],
          // Packages `react` related packages
          ["^react", "^next", "^@?\\w"],
          ["^@app"],
          // Internal packages.
          ["^~(/.*|$)"],
          // Relative imports
          ["^\\.\\.(?!/?$)", "^\\.\\./?$", "^\\./(?=.*/)(?!/?$)", "^\\.(?!/?$)", "^\\./?$"],
          // Style imports.
          ["^.+\\.?(css|scss)$"]
        ]
      }
    ]
  },
  ignorePatterns: ["next.config.js", "cypress/**/*.js", "cypress.config.js"],
  settings: {
    "import/resolver": {
      typescript: {
        project: ["./tsconfig.json"]
      }
    }
  }
};
