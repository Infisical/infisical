import type { ComponentDefinition } from "./types";

export const kbdDefinition = {
  id: "kbd",
  title: "Keyboard shortcut",
  group: "Utilities",
  summary: "Keyboard key caps with platform-aware modifiers and readable sequences.",
  sourceFiles: ["src/components/v4/ui/kbd.tsx", "src/components/v4/ui/kbd.module.css"],
  exports: ["Kbd", "KbdGroup", "KeyCombo", "shortcutSteps"],
  referenceNames: ["Kbd"],
  behavior: [
    "String, array and sequence bindings render one cap per key.",
    "mod becomes Command on Apple and Control elsewhere; explicit platform supports documentation.",
    "Existing composed Kbd children and native element refs remain supported."
  ],
  accessibility: [
    "The shortcut group announces key names rather than symbol glyphs.",
    "Displayed caps are hidden from assistive technology behind one accessible group name."
  ],
  limitations: [
    "Kbd only displays bindings. The host must actually register them.",
    "Automatic platform detection uses navigator.platform in this client application. Use an explicit platform for deterministic server rendering."
  ],
  related: ["tooltip", "input", "command-menu"],
  examples: [
    {
      id: "default",
      title: "Shortcuts in context",
      module: "./examples/kbd/default.tsx",
      states: ["default"]
    },
    {
      id: "sizes",
      title: "Platforms",
      module: "./examples/kbd/sizes.tsx",
      states: ["default"]
    }
  ],
  coverage: [
    {
      axis: "size",
      expected: ["sm", "md"],
      shown: [],
      omitted: [
        {
          value: "md",
          reason: "The one key cap size, 20px. Every example on this page uses it."
        },
        {
          value: "sm",
          reason: "Alias of md. The 2px smaller cap could not be told apart, so both render 20px."
        }
      ]
    },
    {
      axis: "platform",
      expected: ["auto", "mac", "other"],
      shown: [
        { value: "mac", exampleId: "sizes", label: "mac" },
        { value: "other", exampleId: "sizes", label: "other" },
        { value: "auto", exampleId: "default", label: "Chord in a sentence" }
      ]
    },
    {
      axis: "input shape",
      expected: ["string", "combination array", "sequence array", "literal plus"],
      shown: [
        { value: "string", exampleId: "default", label: "Chord in a sentence" },
        { value: "combination array", exampleId: "sizes", label: "mac" },
        { value: "sequence array", exampleId: "default", label: "Sequence" }
      ],
      omitted: [
        {
          value: "literal plus",
          reason:
            'keys="+" or "Ctrl++" renders a Plus cap. It is a parsing case, covered by the component test.'
        }
      ]
    }
  ],
  guidance: {
    use: [
      "Use key caps for a real action hint or an explicitly labeled notation, platform, literal-plus or sequence specimen. KbdGroup is a plain inline wrapper, so prose inside it keeps the surrounding font. Preserve key notation and choose platform deliberately. Specimens that teach syntax do not need registered commands."
    ],
    avoid: [],
    decision:
      "Choose Kbd or KeyCombo for an actual keyboard binding or a labeled key-notation specimen. Register task-action shortcuts in the host; notation and platform comparisons do not imply available commands. Use ordinary Text for an action name.",
    rules: [
      {
        id: "kbd-usage",
        when: "A command uses platform modifiers or a sequence of chords.",
        do: "Show one key cap per key and keep chord versus sequence order explicit.",
        avoid:
          "Render a shortcut that is not bound or join a sequence into an ambiguous single chord.",
        reason: "The display describes behavior but does not implement it.",
        evidence: [
          "src/components/v4/ui/kbd.tsx",
          "src/pages/design-system/examples/kbd/default.tsx"
        ],
        detect: {
          by: "review",
          how: "Compare the displayed chord/sequence with the host's actual binding and platform. Each key is intelligible and only registered bindings are presented as available actions."
        }
      },
      {
        id: "kbd-notation-and-binding",
        when: "Kbd presents an available action hint or an explicitly labeled notation specimen.",
        do: "Bind actual task-action hints in their active host context. Label notation, platform, literal-plus and sequence specimens as syntax demonstrations; they do not need registered commands. Choose explicit platform for deterministic comparisons.",
        avoid:
          "Advertise an unavailable action shortcut, add meaningless commands to notation specimens or apply prose cleanup to literal plus signs and sequence notation.",
        reason:
          "An action hint promises behavior, while a labeled specimen teaches notation. Both preserve exact key syntax without inventing application commands.",
        detect: {
          by: "review",
          how: "Invoke each available task-action hint in its intended context, then type in an editable field and test pending or disabled states where applicable. Check labeled notation, platform, literal-plus and sequence specimens for correct key syntax and clear specimen labeling; do not require or add commands for those comparisons."
        },
        evidence: [
          "src/components/v4/ui/kbd.tsx",
          "src/pages/design-system/examples/kbd/default.tsx"
        ]
      }
    ],
    states: [
      {
        state: "platform",
        guidance: "Use the correct modifier representation for the host platform."
      },
      {
        state: "sequence",
        guidance: "Keep each chord distinguishable so the order can be followed."
      }
    ],
    antiSlop: [
      {
        do: "Place shortcut hints beside the action they invoke.",
        avoid: "Scatter decorative key caps through prose with no available command.",
        reason: "Shortcut styling implies a usable interaction and should not be ornamental."
      }
    ]
  },
  checks: [
    {
      kind: "runtime",
      command: "npm test -- src/components/v4/ui/navigation-helpers.test.tsx"
    },
    {
      kind: "static",
      command: "npm run type:check"
    },
    {
      kind: "browser",
      command: "Verify both themes, platform labels, page boundaries and narrow containers."
    }
  ]
} satisfies ComponentDefinition;
