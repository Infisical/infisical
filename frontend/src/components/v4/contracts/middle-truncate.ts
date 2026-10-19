import type { ComponentDefinition } from "./types";

export const middleTruncateDefinition = {
  id: "middle-truncate",
  title: "Middle truncate",
  group: "Utilities",
  summary: "Keep both ends of a long identifier within its available width.",
  sourceFiles: ["src/components/v4/ui/middle-truncate.tsx", "src/components/v4/ui/text.module.css"],
  exports: ["MiddleTruncate"],
  referenceNames: ["MiddleTruncate"],
  behavior: [
    "Measures available width and recalculates on resize and font readiness.",
    "Copy retains the complete original string."
  ],
  accessibility: [
    "Assistive technology receives the full string.",
    "The default title exposes the full value on hover."
  ],
  limitations: [
    "For public identifiers only; do not pass secret material.",
    "An identifier wider than its container may show only an ellipsis."
  ],
  examples: [
    {
      id: "default",
      title: "Keep both ends of a public resource path",
      module: "./examples/middle-truncate/default.tsx",
      states: ["overflow"]
    },
    {
      id: "states",
      title: "Width and copy states",
      module: "./examples/middle-truncate/states.tsx",
      states: ["default"]
    }
  ],
  coverage: [
    {
      axis: "width state",
      expected: ["fits", "truncated", "narrow"],
      shown: [
        {
          value: "fits",
          exampleId: "states",
          label: "Fits fully"
        },
        {
          value: "truncated",
          exampleId: "states",
          label: "Default end, plain text"
        },
        {
          value: "narrow",
          exampleId: "states",
          label: "Narrow, end 16"
        }
      ]
    },
    {
      axis: "copy",
      expected: ["original full value"],
      shown: [
        {
          value: "original full value",
          exampleId: "states",
          label: "Copy full resource path"
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
      "Use MiddleTruncate where both ends matter, let the containing layout bound width and preserve the complete original for assistive text and copying."
    ],
    avoid: [
      "Pass secret material, truncate prose instructions or copy the shortened visible ellipsis string."
    ],
    decision:
      "Choose MiddleTruncate for public identifiers whose beginning and ending both matter. Use normal wrapping for prose and SensitiveEditor for secrets.",
    rules: [
      {
        id: "middle-truncate-usage",
        when: "A long public resource identifier must fit beside row actions.",
        do: "Keep the full public identifier in the data and provide a keyboard-reachable copy or details route when its full text matters to the task.",
        avoid:
          "Store or copy the shortened string, rely only on a native title tooltip, or pass secret material to this display.",
        reason:
          "A native title is mainly a pointer affordance. Truncation must not make the exact identifier unavailable to keyboard users.",
        evidence: [
          "src/components/v4/ui/middle-truncate.tsx",
          "src/pages/design-system/examples/middle-truncate/default.tsx"
        ],
        detect: {
          by: "review",
          how: "Use keyboard and copy to recover the full public identifier; the shortened visual string is never the stored/copied value and native title is not the only inspection route."
        }
      }
    ],
    states: [
      {
        state: "narrow",
        guidance:
          "Allow a minimal ellipsis when neither end can fit rather than forcing page overflow."
      },
      {
        state: "copy",
        guidance: "Copy the full public identifier from the host value, not the shortened display."
      }
    ],
    antiSlop: [
      {
        do: "Use truncation only where preserving both ends aids recognition.",
        avoid: "Apply middle ellipses to every heading and sentence for visual uniformity.",
        reason: "Prose loses meaning when the middle is removed."
      }
    ]
  },
  checks: [
    {
      kind: "static",
      command: "npm run type:check"
    },
    {
      kind: "browser",
      command:
        "npm run ui:dev; open /design-system#middle-truncate and exercise the documented interaction."
    }
  ]
} satisfies ComponentDefinition;
