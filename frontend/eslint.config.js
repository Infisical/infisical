import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import tseslint from "typescript-eslint";
import { FlatCompat } from "@eslint/eslintrc";
import stylisticPlugin from "@stylistic/eslint-plugin";
import importPlugin from "eslint-plugin-import";
import pluginRouter from "@tanstack/eslint-plugin-router";

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname
});

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [
      ...pluginRouter.configs["flat/recommended"],
      js.configs.recommended,
      tseslint.configs.recommended,
      ...compat.extends("airbnb"),
      ...compat.extends("@kesills/airbnb-typescript"),
      eslintPluginPrettier
    ],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      "simple-import-sort": simpleImportSort,
      import: importPlugin
    },
    settings: {
      "import/resolver": {
        typescript: {
          project: ["./tsconfig.json"]
        }
      }
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": "off",
      "@typescript-eslint/only-throw-error": "off",
      "@typescript-eslint/no-empty-function": "off",
      quotes: ["error", "double", { avoidEscape: true }],
      "comma-dangle": ["error", "only-multiline"],
      "react/react-in-jsx-scope": "off",
      "import/prefer-default-export": "off",
      "react-hooks/exhaustive-deps": "off",
      "@typescript-eslint/ban-ts-comment": "warn",
      "react/jsx-props-no-spreading": "off", // switched off for component building
      // TODO: This rule will be switched ON after complete revamp of frontend
      "@typescript-eslint/no-explicit-any": "off",
      "jsx-a11y/control-has-associated-label": "off",
      "import/no-extraneous-dependencies": [
        "error",
        {
          devDependencies: true
        }
      ],
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
      ],
      "import/first": "error",
      "import/newline-after-import": "error",
      "import/no-duplicates": "error"
    }
  },
  {
    rules: Object.fromEntries(
      Object.keys(stylisticPlugin.configs["all-flat"].rules ?? {}).map((key) => [key, "off"])
    )
  }
);
