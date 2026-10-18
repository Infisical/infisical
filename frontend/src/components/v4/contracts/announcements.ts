import type { ComponentDefinition } from "./types";

export const announcementsDefinition = {
  id: "announcements",
  title: "Announcements",
  group: "Composites",
  summary: "What's new, as cards that cycle in a 480px dialog with dots, Back and Next.",
  sourceFiles: [
    "src/components/v4/ui/announcements.tsx",
    "src/components/v4/ui/announcements.module.css"
  ],
  exports: ["Announcements"],
  referenceNames: ["Announcements"],
  behavior: [
    "Each card has inert media, an eyebrow, a title, a line or two and an optional action link.",
    "Cards slide in the direction of travel and the dialog eases to each card's height; reduced motion jumps.",
    "Left and Right move and wrap around unless loop is false. Dots jump to a card. Next becomes Done on the last card and Done closes.",
    "onSeen fires as each card shows, so the host can clear its unread count."
  ],
  accessibility: [
    "The dialog is a carousel; each card is a slide named 2 of 4, and a polite live region reads the position and title on each change.",
    "Focus starts on Next."
  ],
  limitations: ["Swipe on touch is not implemented; use the dots or Back and Next."],
  examples: [
    {
      id: "default",
      title: "What's new",
      module: "./examples/announcements/default.tsx",
      states: ["default", "controlled", "keyboard"]
    }
  ],
  coverage: [
    {
      axis: "size support",
      expected: ["no authored named size"],
      shown: [],
      omitted: [
        {
          value: "no authored named size",
          reason: "The dialog is always 480px wide and its height follows each card."
        }
      ]
    }
  ],
  guidance: {
    use: [
      "Use Announcements from a What's new row or button with a count of unseen cards, with three to five cards newest first."
    ],
    avoid: [
      "Open it on its own over someone's work, or fill the media with illustrations or gradients."
    ],
    decision:
      "Choose Announcements for release notes people opt into. Use Banner for a standing condition and Toast for the result of an action.",
    rules: [
      {
        id: "announcements-titles",
        when: "A card describes a new feature.",
        do: "Title it with what people can now do, such as Share a secret with a link that expires.",
        avoid: "Use the feature's internal name as the title.",
        reason: "A capability tells people why to care.",
        evidence: ["src/pages/design-system/examples/announcements/default.tsx"],
        detect: {
          by: "review",
          how: "Read each card title as an action someone can take today."
        }
      },
      {
        id: "announcements-media",
        when: "A card has media.",
        do: "Show the real feature built from v4 components, made inert.",
        avoid: "Use screenshots, illustrations or gradients.",
        reason: "Real components stay accurate in both themes and at every corner setting.",
        evidence: [
          "src/components/v4/ui/announcements.tsx",
          "src/pages/design-system/examples/announcements/default.tsx"
        ],
        detect: {
          by: "review",
          how: "Inspect each media area for components rather than images."
        }
      }
    ],
    states: [
      {
        state: "last card",
        guidance: "Next reads Done and closes the dialog."
      },
      {
        state: "seen",
        guidance: "The host clears the unseen count from onSeen."
      }
    ],
    antiSlop: [
      {
        do: "Keep the eyebrow to the area and the date.",
        avoid: "Add exclamation marks or New badges to every card.",
        reason: "The dialog already says these are new."
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
        "npm run ui:dev; open /design-system#announcements and exercise the documented interaction."
    }
  ]
} satisfies ComponentDefinition;
