import type { ComponentDefinition } from "./types";

export const snippetDefinition = {
  id: "snippet",
  title: "Snippet",
  group: "Code",
  summary: "Present a selectable one-line command and copy its literal value.",
  sourceFiles: ["src/components/v4/ui/snippet.tsx", "src/components/v4/ui/code.module.css"],
  exports: ["Snippet"],
  referenceNames: ["Snippet"],
  behavior: [
    "The prompt is visual context and is never copied. Size defaults to sm32; explicit md is 36px, with nested copy actions at 24/28px.",
    "The read-only input supports selection; copy waits for clipboard fulfillment."
  ],
  accessibility: ["Caller supplies an input label; the copy control is separately named."],
  limitations: ["Do not imply that copying executes the command or conceals sensitive arguments."],
  examples: [
    {
      id: "default",
      title: "Copy a literal run command",
      module: "./examples/snippet/default.tsx",
      states: ["read-only"]
    },
    {
      id: "states",
      title: "Sizes and field states",
      module: "./examples/snippet/states.tsx",
      states: ["default"]
    },
    {
      id: "behavior",
      title: "Exact command copy",
      module: "./examples/snippet/behavior.tsx",
      states: ["default", "loading", "error", "success"]
    }
  ],
  coverage: [
    {
      axis: "size",
      expected: ["sm", "md"],
      shown: [
        {
          value: "sm",
          exampleId: "states",
          label: "sm"
        },
        {
          value: "md",
          exampleId: "states",
          label: "md"
        }
      ]
    },
    {
      axis: "configuration",
      expected: ["prompt", "no prompt", "copy disabled", "invalid"],
      shown: [
        {
          value: "prompt",
          exampleId: "states",
          label: "sm"
        },
        {
          value: "no prompt",
          exampleId: "states",
          label: "No prompt, copy disabled"
        },
        {
          value: "copy disabled",
          exampleId: "states",
          label: "No prompt, copy disabled"
        },
        {
          value: "invalid",
          exampleId: "states",
          label: "Unavailable command"
        }
      ]
    },
    {
      axis: "copy lifecycle",
      expected: ["pending", "failed", "copied"],
      shown: [
        {
          value: "pending",
          exampleId: "behavior",
          label: "Copying"
        },
        {
          value: "failed",
          exampleId: "behavior",
          label: "Copy failed. Try again."
        },
        {
          value: "copied",
          exampleId: "behavior",
          label: "Command copied"
        }
      ]
    }
  ],
  guidance: {
    use: [
      "Use sm or md for a selectable one-line safe command. The optional prompt is context, and the optional copy action copies value only."
    ],
    avoid: [],
    decision:
      "Choose Snippet for a literal one-line command that can be copied. Use CodeBlock for multiline source and Input for editing.",
    rules: [
      {
        id: "snippet-usage",
        when: "The command is copied into a terminal.",
        do: "Copy the exact provided string only after a real clipboard write and keep the command selectable.",
        avoid: "Add a shell prompt to the copied value or claim copying executed the command.",
        reason: "Clipboard output must be ready to paste without inventing execution state.",
        evidence: [
          "src/components/v4/ui/snippet.tsx",
          "src/pages/design-system/examples/snippet/default.tsx"
        ],
        detect: {
          by: "review",
          how: "Copy a command containing quotes and spaces. Clipboard output is the literal command without its decorative prompt, and feedback waits for a fulfilled write."
        }
      },
      {
        id: "snippet-command-copy-and-density",
        when: "A one-line command appears with a prompt and copy action.",
        do: "Keep value as the exact safe command, use prompt only for visual context and choose the supported sm or md host size without caller padding patches.",
        avoid:
          "Include the prompt in copied text, imply Copy runs the command or let its nested action make both advertised sizes identical.",
        reason:
          "Command presentation, clipboard value and action geometry must agree without changing the command's meaning.",
        detect: {
          by: "review",
          how: "Compare sm and md with the same long command, then reject and retry copying. Sizes remain distinct, the prompt is excluded and copied bytes equal value exactly."
        },
        evidence: [
          "src/components/v4/ui/snippet.tsx",
          "src/pages/design-system/examples/snippet/default.tsx"
        ]
      }
    ],
    states: [
      {
        state: "copy-error",
        guidance: "Report failure and leave the literal command available for manual selection."
      },
      {
        state: "long-command",
        guidance: "Preserve the exact value while allowing horizontal inspection."
      }
    ],
    antiSlop: [
      {
        do: "Give a short label explaining where the command is used.",
        avoid: "Add a Copy button to prose that is not intended to be pasted.",
        reason: "The action should have a clear destination and literal output."
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
        "npm run ui:dev; open /design-system#snippet and exercise the documented interaction."
    }
  ]
} satisfies ComponentDefinition;
