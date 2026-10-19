/* eslint-env node */
const { rules: bestPractices } = require("eslint-config-airbnb-base/rules/best-practices");
const { rules: es6 } = require("eslint-config-airbnb-base/rules/es6");
const { rules: imports } = require("eslint-config-airbnb-base/rules/imports");
const { rules: style } = require("eslint-config-airbnb-base/rules/style");
const { rules: variables } = require("eslint-config-airbnb-base/rules/variables");

// What eslint-config-airbnb-typescript/base added on top of airbnb-base. It has no release that
// supports typescript-eslint 8, so it lives here. Its formatting rules are left out: they no longer
// exist in typescript-eslint 8, and Prettier owns formatting.
const airbnbTypescriptRules = {
  camelcase: "off",
  "@typescript-eslint/naming-convention": [
    "error",
    { selector: "variable", format: ["camelCase", "PascalCase", "UPPER_CASE"] },
    { selector: "function", format: ["camelCase", "PascalCase"] },
    { selector: "typeLike", format: ["PascalCase"] }
  ],
  "default-param-last": "off",
  "@typescript-eslint/default-param-last": bestPractices["default-param-last"],
  "dot-notation": "off",
  "@typescript-eslint/dot-notation": bestPractices["dot-notation"],
  "no-array-constructor": "off",
  "@typescript-eslint/no-array-constructor": style["no-array-constructor"],
  "no-dupe-class-members": "off",
  "@typescript-eslint/no-dupe-class-members": es6["no-dupe-class-members"],
  "no-empty-function": "off",
  "@typescript-eslint/no-empty-function": bestPractices["no-empty-function"],
  "no-implied-eval": "off",
  "no-new-func": "off",
  "@typescript-eslint/no-implied-eval": bestPractices["no-implied-eval"],
  "no-loop-func": "off",
  "@typescript-eslint/no-loop-func": bestPractices["no-loop-func"],
  "no-magic-numbers": "off",
  "@typescript-eslint/no-magic-numbers": bestPractices["no-magic-numbers"],
  "no-redeclare": "off",
  "@typescript-eslint/no-redeclare": bestPractices["no-redeclare"],
  "no-shadow": "off",
  "@typescript-eslint/no-shadow": variables["no-shadow"],
  "no-throw-literal": "off",
  "@typescript-eslint/only-throw-error": bestPractices["no-throw-literal"],
  "no-unused-expressions": "off",
  "@typescript-eslint/no-unused-expressions": bestPractices["no-unused-expressions"],
  "no-unused-vars": "off",
  "no-use-before-define": "off",
  "@typescript-eslint/no-use-before-define": variables["no-use-before-define"],
  "no-useless-constructor": "off",
  "@typescript-eslint/no-useless-constructor": es6["no-useless-constructor"],
  "require-await": "off",
  "@typescript-eslint/require-await": bestPractices["require-await"],
  "no-return-await": "off",
  "@typescript-eslint/return-await": [bestPractices["no-return-await"], "in-try-catch"],
  "@typescript-eslint/no-unused-vars": [
    variables["no-unused-vars"][0],
    // typescript-eslint 8 changed the default to "all"; "none" keeps the behavior of v6.
    { ...variables["no-unused-vars"][1], caughtErrors: "none" }
  ],
  "import/no-extraneous-dependencies": [
    imports["import/no-extraneous-dependencies"][0],
    {
      ...imports["import/no-extraneous-dependencies"][1],
      devDependencies: imports["import/no-extraneous-dependencies"][1].devDependencies.flatMap((glob) => {
        const tsGlob = glob.replace(/\bjs(x?)\b/g, "ts$1");
        return tsGlob === glob ? [glob] : [glob, tsGlob];
      })
    }
  ]
};

module.exports = {
  env: {
    es6: true,
    node: true
  },
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-type-checked",
    "airbnb-base",
    "plugin:prettier/recommended",
    "prettier"
  ],
  plugins: ["@typescript-eslint", "simple-import-sort", "import"],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: true,
    sourceType: "module",
    tsconfigRootDir: __dirname
  },
  settings: {
    "import/parsers": { "@typescript-eslint/parser": [".ts", ".tsx", ".d.ts"] },
    "import/resolver": { node: { extensions: [".mjs", ".js", ".json", ".ts", ".d.ts"] } },
    "import/extensions": [".js", ".mjs", ".jsx", ".ts", ".tsx", ".d.ts"],
    "import/external-module-folders": ["node_modules", "node_modules/@types"]
  },
  root: true,
  overrides: [
    {
      files: ["*.ts", "*.tsx"],
      rules: {
        // Already checked, more thoroughly, by the TypeScript compiler.
        "constructor-super": "off",
        "getter-return": "off",
        "no-const-assign": "off",
        "no-dupe-args": "off",
        "no-dupe-class-members": "off",
        "no-dupe-keys": "off",
        "no-func-assign": "off",
        "no-import-assign": "off",
        "no-new-symbol": "off",
        "no-obj-calls": "off",
        "no-redeclare": "off",
        "no-setter-return": "off",
        "no-this-before-super": "off",
        "no-undef": "off",
        "no-unreachable": "off",
        "no-unsafe-negation": "off",
        "valid-typeof": "off",
        "import/named": "off",
        "import/no-named-as-default-member": "off",
        "import/no-unresolved": "off"
      }
    },
    {
      files: ["./src/**/*"],
      excludedFiles: ["./src/lib/telemetry/*"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                group: ["@opentelemetry/*"],
                message:
                  "OpenTelemetry may only be imported from src/lib/telemetry. Record through the instruments exported by @app/lib/telemetry/metrics, or add your instrument there."
              }
            ]
          }
        ],
        "no-restricted-syntax": [
          "error",
          {
            selector:
              "MemberExpression[property.name='getMeter'], MemberExpression[property.value='getMeter'], ObjectPattern > Property[key.name='getMeter']",
            message:
              "Do not acquire an OpenTelemetry meter directly. Use highCardinalityMeter (per-actor labels) or resolveCoreMeter (observable gauges) from @app/lib/telemetry/metrics."
          }
        ]
      }
    },
    {
      files: ["./e2e-test/**/*", "./src/db/migrations/**/*"],
      rules: {
        "@typescript-eslint/no-unsafe-member-access": "off",
        "@typescript-eslint/no-unsafe-assignment": "off",
        "@typescript-eslint/no-unsafe-argument": "off",
        "@typescript-eslint/no-unsafe-return": "off",
        "@typescript-eslint/no-unsafe-call": "off"
      }
    },
    {
      files: ["./src/db/migrations/**/*"],
      rules: {
        "no-restricted-syntax": [
          "error",
          {
            selector:
              "MemberExpression[property.name='encryptWithRootEncryptionKey'], MemberExpression[property.name='decryptWithRootEncryptionKey'], CallExpression[callee.name='buildSecretBlindIndexFromName']",
            message:
              "A migration cannot use the instance root encryption key: it runs before the key is loaded and would fall back to process.env, which is the wrong key on any instance that has rotated ENCRYPTION_KEY. Do this work in a post-boot background job instead."
          }
        ]
      }
    }
  ],

  rules: {
    ...airbnbTypescriptRules,
    // typescript-eslint 8 widened these rules and they report ~1,000 findings on code that predates
    // the upgrade. Off until a follow-up re-enables them and fixes the findings.
    "@typescript-eslint/no-unnecessary-type-assertion": "off",
    "@typescript-eslint/await-thenable": "off",
    "@typescript-eslint/no-base-to-string": "off",
    "@typescript-eslint/prefer-promise-reject-errors": "off",
    "@typescript-eslint/return-await": "off",
    // v6's ban-types allowed empty interfaces; keep that while v8 still rejects a bare `{}` type.
    "@typescript-eslint/no-empty-object-type": ["error", { allowInterfaces: "always" }],
    "@typescript-eslint/no-empty-function": "off",
    "@typescript-eslint/no-unsafe-enum-comparison": "off",
    "no-void": "off",
    "no-continue": "off",
    "consistent-return": "off", // my style
    "import/order": "off", // for simple-import-order
    "import/prefer-default-export": "off", // why
    "no-restricted-syntax": "off",
    // importing rules
    "simple-import-sort/exports": "error",
    "import/first": "error",
    "import/newline-after-import": "error",
    "import/no-duplicates": "error",
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
    ],
    "import/extensions": [
      "error",
      "ignorePackages",
      {
        "": "never", // this is required to get the .tsx to work...
        ts: "never",
        tsx: "never"
      }
    ]
  }
};
