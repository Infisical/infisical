import { plugin as shadcn } from "@shadcn/lint";

import base from "./eslint.config.js";

export default [
  ...base,
  {
    files: ["src/pages/design-system/**/*.{ts,tsx}"],
    plugins: { shadcn },
    settings: {
      shadcn: {
        ui: "@app/components/v4/ui",
        componentImports: ["^@app/components/v4/ui(/|$)"],
        note: "Tokens live in src/components/v4/tokens.json. Soft corners are canonical."
      }
    },
    rules: {
      "shadcn/no-raw-colors": "error",
      "shadcn/no-restyle": ["error", { allow: ["layout"] }]
    }
  }
];
