import type { ComponentDefinition } from "./types";

export const codeBlockDefinition = {
  id: "code-block",
  title: "Code block",
  group: "Code",
  summary: "Frame code or redacted JSON with a label, actions and truthful copy feedback.",
  sourceFiles: [
    "src/components/v4/ui/code-block.tsx",
    "src/components/v4/ui/code.module.css",
    "src/components/v4/ui/frame.module.css"
  ],
  exports: ["CodeBlock"],
  referenceNames: ["CodeBlock"],
  behavior: [
    "The block uses the shared framed shell: the mono label, icon, actions and Copy sit in the tint frame header, and the code sits in the inset raised surface.",
    "Copy uses literal source, excluding displayed line numbers.",
    "A direct Json child supplies its recursively redacted copy text. Custom React children receive the owned body inset and text role; do not duplicate that padding inside the child."
  ],
  accessibility: [
    "Copy success follows clipboard fulfillment; failures remain visible.",
    "The block is a section named by its label, and the code region takes the same label.",
    "Content uses a focusable scroll region."
  ],
  limitations: [
    "Custom React children require an explicit safe copyValue.",
    "Pass Json directly for automatic redacted JSON copy; wrappers are not inspected."
  ],
  examples: [
    {
      id: "default",
      title: "Filename, terminal, line numbers and copy",
      module: "./examples/code-block/default.tsx",
      states: ["default"]
    }
  ],
  coverage: [
    {
      axis: "content",
      expected: ["code string", "Json", "custom copyValue", "custom no copy source"],
      shown: [
        {
          value: "code string",
          exampleId: "default",
          label: "environment.env"
        }
      ],
      omitted: [
        {
          value: "Json",
          reason:
            "Json children render the JSON tree below the same header; the JSON page shows the tree and the code-block fixture test renders it."
        },
        {
          value: "custom copyValue",
          reason:
            "Custom children sit in a body-text inset and copy the explicit value; the code-block fixture test renders it."
        },
        {
          value: "custom no copy source",
          reason:
            "Without a copy source the copy button is disabled; the code-block fixture test renders it."
        }
      ]
    },
    {
      axis: "copy state",
      expected: ["enabled", "disabled", "pending", "failed", "copied"],
      shown: [
        {
          value: "enabled",
          exampleId: "default",
          label: "Copy code"
        }
      ],
      omitted: [
        {
          value: "disabled",
          reason:
            "Copy is disabled only when there is no copy source; the code-block fixture test renders it."
        },
        {
          value: "pending",
          reason:
            "Press Copy code to see it; content-behavior.test.tsx drives pending, failure and success."
        },
        {
          value: "failed",
          reason: "Shown only when the clipboard write fails; content-behavior.test.tsx drives it."
        },
        {
          value: "copied",
          reason: "Press Copy code to see it; content-behavior.test.tsx drives it."
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
      "Frame multiline source with a useful resource label and one copy action. Give custom content an explicit safe copy source."
    ],
    avoid: [],
    decision:
      "Choose CodeBlock to frame inspectable code with a title and truthful copy feedback. Use Snippet for one command and Json for structured redaction.",
    rules: [
      {
        id: "code-block-usage",
        when: "Custom React content is displayed inside the code frame.",
        do: "Supply an explicit safe copyValue, or pass Json directly to share its redacted source.",
        avoid:
          "Assume nested arbitrary wrappers can be inspected for redaction or copy the original unredacted object.",
        reason: "Rendered content and clipboard output must follow the same safety boundary.",
        evidence: [
          "src/components/v4/ui/code-block.tsx",
          "src/pages/design-system/examples/code-block/default.tsx"
        ],
        detect: {
          by: "review",
          how: "Copy direct redacted Json and custom React content with safe copyValue. Clipboard output equals the safe displayed source, and failed writes never announce copied."
        }
      },
      {
        id: "code-block-safe-copy-source",
        when: "A framed technical specimen contains custom React children.",
        do: "Pass an explicit safe copyValue for custom children, or pass Json directly for automatic redacted copy, and keep one outcome region for copy feedback.",
        avoid:
          "Infer copy text from arbitrary rendered markup or let a Copied label squeeze out the filename or appear twice.",
        reason:
          "The visible specimen and copied payload need an explicit safe relationship, while feedback must preserve resource identity.",
        detect: {
          by: "review",
          how: "Copy a long-labeled custom specimen, reject the write and retry. The exact safe payload is used, the label remains readable and success appears once after fulfillment."
        },
        evidence: [
          "src/components/v4/ui/code-block.tsx",
          "src/pages/design-system/examples/code-block/default.tsx"
        ]
      }
    ],
    states: [
      {
        state: "copying",
        guidance: "Await the clipboard write and show success only after fulfillment."
      },
      {
        state: "copy-error",
        guidance:
          "Keep the safe source available and report failure without claiming it was copied."
      }
    ],
    antiSlop: [
      {
        do: "Name the file or purpose in the frame header.",
        avoid: "Add a second toolbar and decorative filename to every one-line value.",
        reason: "The frame should help inspect and copy actual source, not inflate a short string."
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
      command:
        "npm run ui:dev; open /design-system#code-block and exercise the documented interaction."
    }
  ]
} satisfies ComponentDefinition;
