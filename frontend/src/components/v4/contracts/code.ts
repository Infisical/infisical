import type { ComponentDefinition } from "./types";

export const codeDefinition = {
  id: "code",
  title: "Code",
  group: "Code",
  summary: "Display literal machine text inline or in a scrollable block.",
  sourceFiles: [
    "src/components/v4/ui/code.tsx",
    "src/components/v4/ui/code-tokenizer.ts",
    "src/components/v4/ui/code.module.css"
  ],
  exports: ["Code"],
  referenceNames: ["Code"],
  behavior: [
    "In block mode, maxLines follows computed line height and the shared body inset, so text enlargement preserves the requested visible-line bound.",
    "Inline styling and block mode with wrapping, line numbers and highlighted lines.",
    "All input renders as text; no HTML interpretation."
  ],
  accessibility: [
    "Scrollable blocks are keyboard focusable named regions.",
    "Line numbers are excluded from the accessibility tree."
  ],
  limitations: [
    "Lexical highlighting supports shell, env, JSON, YAML, JavaScript, TypeScript, Python and HCL aliases; unknown languages use plain text.",
    "Apply redaction before passing sensitive text."
  ],
  examples: [
    {
      id: "default",
      title: "Literal keys and numbered shell commands",
      module: "./examples/code/default.tsx",
      states: ["default", "overflow"]
    },
    {
      id: "variants",
      title: "Formats and lexical families",
      module: "./examples/code/variants.tsx",
      states: ["default"]
    }
  ],
  coverage: [
    {
      axis: "format",
      expected: ["syntax", "plain"],
      shown: [
        {
          value: "syntax",
          exampleId: "variants",
          label: "shell"
        },
        {
          value: "plain",
          exampleId: "variants",
          label: "Plain"
        }
      ]
    },
    {
      axis: "syntax family",
      expected: [
        "shell",
        "env",
        "json",
        "yaml",
        "javascript",
        "typescript",
        "python",
        "hcl",
        "fallback"
      ],
      shown: [
        {
          value: "shell",
          exampleId: "variants",
          label: "shell"
        },
        {
          value: "env",
          exampleId: "variants",
          label: "env"
        },
        {
          value: "json",
          exampleId: "variants",
          label: "json"
        },
        {
          value: "yaml",
          exampleId: "variants",
          label: "yaml"
        },
        {
          value: "javascript",
          exampleId: "variants",
          label: "javascript"
        },
        {
          value: "typescript",
          exampleId: "variants",
          label: "typescript"
        },
        {
          value: "python",
          exampleId: "variants",
          label: "python"
        },
        {
          value: "hcl",
          exampleId: "variants",
          label: "hcl"
        },
        {
          value: "fallback",
          exampleId: "variants",
          label: "unknown-language"
        }
      ]
    },
    {
      axis: "layout",
      expected: ["inline", "block", "line numbers", "highlight", "wrap", "bounded"],
      shown: [
        {
          value: "inline",
          exampleId: "default",
          label: "INFISICAL_ENV"
        },
        {
          value: "block",
          exampleId: "variants",
          label: "Plain"
        },
        {
          value: "line numbers",
          exampleId: "variants",
          label: "Wrapped and bounded"
        },
        {
          value: "highlight",
          exampleId: "variants",
          label: "Wrapped and bounded"
        },
        {
          value: "wrap",
          exampleId: "variants",
          label: "Wrapped and bounded"
        },
        {
          value: "bounded",
          exampleId: "variants",
          label: "Wrapped and bounded"
        }
      ]
    },
    {
      axis: "size support",
      expected: ["no authored named size"],
      shown: [],
      omitted: [
        {
          value: "no authored named size",
          reason:
            "This family has no authored sm/md/lg size option. Its dimensions follow content or its container; examples preserve that API."
        }
      ]
    }
  ],
  guidance: {
    use: [
      "Pass the original safe source, choose inline or block deliberately and use format=plain when highlighting adds no meaning."
    ],
    avoid: [
      "Reformat a copied command, include secrets before redaction or add syntax colors to ordinary explanatory prose."
    ],
    decision:
      "Choose Code for literal machine text inline or in a scrollable block. Use Text for prose, Json for structured inspection and Textarea for editing.",
    rules: [
      {
        id: "code-usage",
        when: "The source can contain credentials or sensitive values.",
        do: "Redact before passing the string to Code and choose a language only when it matches the literal source.",
        avoid:
          "Pass secrets and rely on syntax styling to conceal them, or reformat literal output as prose.",
        reason:
          "Code renders the provided text; highlighting is neither redaction nor an editing model.",
        evidence: [
          "src/components/v4/ui/code.tsx",
          "src/pages/design-system/examples/code/default.tsx"
        ],
        detect: {
          by: "review",
          how: "Render and copy a synthetic literal containing whitespace and quotes; its exact source is preserved, and redaction happened before Code received sensitive values."
        }
      }
    ],
    states: [
      {
        state: "unknown-language",
        guidance: "Allow plain text rather than claiming unsupported syntax semantics."
      },
      {
        state: "long-line",
        guidance:
          "Preserve exact characters and allow scrolling instead of inserting misleading line breaks."
      }
    ],
    antiSlop: [
      {
        do: "Use highlighting to make real syntax easier to scan.",
        avoid: "Invent colored pseudo-code as decorative filler in a settings page.",
        reason: "Machine-looking decoration can be mistaken for an executable instruction."
      }
    ]
  },
  checks: [
    {
      kind: "static",
      command: "npm run type:check"
    },
    {
      kind: "runtime",
      command: "npm test -- src/components/v4/ui/code-runtime.test.tsx"
    },
    {
      kind: "browser",
      command: "npm run ui:dev; open /design-system#code and exercise the documented interaction."
    }
  ]
} satisfies ComponentDefinition;
