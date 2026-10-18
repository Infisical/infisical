import type { ComponentDefinition } from "./types";

export const jsonDefinition = {
  id: "json",
  title: "JSON",
  group: "Code",
  summary: "Inspect a JSON tree with recursive redaction before rendering.",
  sourceFiles: [
    "src/components/v4/ui/json.tsx",
    "src/components/v4/ui/json-model.ts",
    "src/components/v4/ui/code.module.css"
  ],
  exports: ["Json", "redactJson", "prepareJson"],
  referenceNames: ["Json"],
  behavior: [
    "maxLines follows computed line height and the shared body inset, so text enlargement preserves the requested visible-line bound.",
    "Objects and arrays expand independently with two levels initially open.",
    "Named-key or predicate redaction replaces values before rendering and copying."
  ],
  accessibility: [
    "Each node's toggle is a named button that announces whether the node is expanded.",
    "The tree is a named scroll region."
  ],
  limitations: [
    "Only JSON-compatible values are supported. Preview depth and node counts are bounded; Copy retains the full safe source.",
    "Invalid JSON strings display as literal code; with requested redaction, unparseable input is fully redacted."
  ],
  examples: [
    {
      id: "default",
      title: "Nested audit data with recursive redaction",
      module: "./examples/json/default.tsx",
      states: ["default", "overflow"]
    }
  ],
  coverage: [
    {
      axis: "shape",
      expected: [
        "null",
        "scalar",
        "empty array",
        "empty object",
        "collapsed",
        "limited",
        "predicate redaction",
        "wrap",
        "maxLines"
      ],
      shown: [],
      omitted: [
        {
          value: "maxLines",
          reason:
            'Cut to keep the page to the essentials; the json fixture test renders it as "Bounded JSON".'
        },
        {
          value: "null",
          reason:
            'Cut to keep the page to the essentials; the json fixture test renders it as "Scalar and null".'
        },
        {
          value: "scalar",
          reason:
            'Cut to keep the page to the essentials; the json fixture test renders it as "Scalar and null".'
        },
        {
          value: "empty array",
          reason:
            'Cut to keep the page to the essentials; the json fixture test renders it as "Empty collections".'
        },
        {
          value: "empty object",
          reason:
            'Cut to keep the page to the essentials; the json fixture test renders it as "Empty collections".'
        },
        {
          value: "collapsed",
          reason:
            'Cut to keep the page to the essentials; the json fixture test renders it as "Collapsed root".'
        },
        {
          value: "limited",
          reason:
            'Cut to keep the page to the essentials; the json fixture test renders it as "Preview limits".'
        },
        {
          value: "predicate redaction",
          reason:
            'Cut to keep the page to the essentials; the json fixture test renders it as "Predicate redaction".'
        },
        {
          value: "wrap",
          reason:
            'Cut to keep the page to the essentials; the json fixture test renders it as "Wrapped long value".'
        }
      ]
    },
    {
      axis: "safe exact copy",
      expected: ["complete safe copy", "copy failure"],
      shown: [],
      omitted: [
        {
          value: "complete safe copy",
          reason:
            "Wrap Json in CodeBlock to copy the complete redacted payload, as the code-block fixtures do; the json fixture test renders it."
        },
        {
          value: "copy failure",
          reason:
            "Shown only when the clipboard write fails; content-behavior.test.tsx drives the same copy failure."
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
      "Inspect JSON-compatible data with explicit recursive redaction. Preview limits and expansion govern reading, not safe copy completeness."
    ],
    avoid: [],
    decision:
      "Choose Json for structured inspection and recursive redaction. Use Code for literal source and Input or Textarea for editing.",
    rules: [
      {
        id: "json-usage",
        when: "A nested object can contain sensitive keys.",
        do: "Apply the redaction predicate recursively before rendering and copying, and pass only JSON-compatible values.",
        avoid:
          "Redact the visible tree while copying the original object or assume collapsed nodes are concealed secrets.",
        reason:
          "Collapsed presentation is not a data boundary; clipboard content must use the same safe source.",
        evidence: [
          "src/components/v4/ui/json.tsx",
          "src/pages/design-system/examples/json/default.tsx"
        ],
        detect: {
          by: "review",
          how: "Redact a sensitive key nested in objects and arrays, then copy from a bounded preview. Rendered and copied values use the same recursively safe source."
        }
      },
      {
        id: "json-redaction-before-copy",
        when: "Structured inspection includes fields that must not be revealed.",
        do: "Use named-key or predicate redaction before rendering and copying, and distinguish bounded preview limits from the complete safe copy source.",
        avoid:
          "Assume collapsed nodes conceal secrets, copy the unredacted input or describe a truncated preview as the entire document.",
        reason:
          "Collapsed or limited content can still be present in data; redaction must govern both visible and copied values.",
        detect: {
          by: "review",
          how: "Redact nested values, limit preview depth and copy. The copy contains the full safe document, never the hidden original, and invalid input with redaction requested stays fully redacted."
        },
        evidence: [
          "src/components/v4/ui/json.tsx",
          "src/pages/design-system/examples/json/default.tsx"
        ]
      }
    ],
    states: [
      {
        state: "collapsed",
        guidance: "Keep full safe source available for copy even when preview depth is bounded."
      },
      {
        state: "invalid",
        guidance:
          "Treat unparseable input as literal code, or fully redact it when redaction was requested."
      }
    ],
    antiSlop: [
      {
        do: "Use a bounded tree to expose actual structure.",
        avoid: "Expand enormous objects by default or decorate each primitive as a badge.",
        reason:
          "Unbounded structure overwhelms inspection and makes important fields harder to find."
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
      command: "npm run ui:dev; open /design-system#json and exercise the documented interaction."
    }
  ]
} satisfies ComponentDefinition;
