import type { ComponentDefinition } from "./types";

export const animatedCollapseDefinition = {
  id: "animated-collapse",
  title: "Animated collapse",
  group: "Utilities",
  summary: "Reveal a region without leaving hidden descendants in the tab order.",
  sourceFiles: [
    "src/components/v4/ui/animated-collapse.tsx",
    "src/components/v4/ui/text.module.css"
  ],
  exports: ["AnimatedCollapse"],
  referenceNames: ["AnimatedCollapse"],
  behavior: [
    "Open state controls a grid-height transition; lazy mode mounts on first open and retains child state through later closes.",
    "Initial open content appears without an entry animation; reduced motion opens and closes immediately."
  ],
  accessibility: [
    "As soon as it starts closing, the content leaves the tab order and screen readers stop reading it.",
    "Caller connects its trigger with aria-expanded and aria-controls."
  ],
  limitations: ["Caller owns focus return if closing a region that contains focus."],
  examples: [
    {
      id: "default",
      title: "Optional retention details",
      module: "./examples/animated-collapse/default.tsx",
      states: ["default", "keyboard"]
    }
  ],
  coverage: [
    {
      axis: "mount policy",
      expected: ["lazy", "eager"],
      shown: [
        {
          value: "lazy",
          exampleId: "default",
          label: "Advanced settings"
        }
      ],
      omitted: [
        {
          value: "eager",
          reason:
            'Cut to keep the page to the essentials; the animated-collapse fixture test renders it as "Eager connection details".'
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
      "Provide a separate labeled disclosure trigger, choose lazy deliberately and move focus to that trigger before the host closes a focused region."
    ],
    avoid: [
      "Treat AnimatedCollapse as a complete disclosure control or remount its children on every close to animate them."
    ],
    decision:
      "Choose AnimatedCollapse when an optional region needs a height transition. Use Collapsible for a labeled disclosure contract and Accordion for several sections.",
    rules: [
      {
        id: "animated-collapse-usage",
        when: "The region contains the currently focused control when it closes.",
        do: "Move focus to the disclosure trigger before closing and keep hidden descendants out of the tab order.",
        avoid: "Animate a region away while leaving keyboard focus in invisible content.",
        reason: "A visual transition does not resolve focus ownership.",
        evidence: [
          "src/components/v4/ui/animated-collapse.tsx",
          "src/pages/design-system/examples/animated-collapse/default.tsx"
        ],
        detect: {
          by: "review",
          how: "Close a region while a descendant has focus; focus reaches its disclosure trigger and Tab cannot enter hidden content, including with reduced motion."
        }
      }
    ],
    states: [
      {
        state: "closing",
        guidance: "Choose a focus return target before hiding focused content."
      },
      {
        state: "reduced-motion",
        guidance: "Keep the same open and closed meaning without relying on the animation."
      }
    ],
    antiSlop: [
      {
        do: "Animate the actual disclosure height only when it helps continuity.",
        avoid: "Add a delayed animated reveal to ordinary static instructions.",
        reason: "Motion should explain a state change rather than make reading wait."
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
      command: "npm test -- src/components/v4/ui/selection-disclosure.test.tsx"
    },
    {
      kind: "browser",
      command:
        "npm run ui:dev; open /design-system#animated-collapse and exercise the documented interaction."
    }
  ]
} satisfies ComponentDefinition;
