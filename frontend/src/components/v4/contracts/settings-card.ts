import type { ComponentDefinition } from "./types";

export const settingsCardDefinition = {
  id: "settings-card",
  title: "Settings card",
  group: "Composites",
  summary: "One setting, or a few that save together, with a footer that shows status and Save.",
  sourceFiles: [
    "src/components/v4/ui/settings-card.tsx",
    "src/components/v4/ui/settings-card.module.css"
  ],
  exports: ["SettingsCard"],
  referenceNames: ["SettingsCard"],
  behavior: [
    "The footer shows one status at a time: the hint, Unsaved changes, Saving, Saved for three seconds, the failure message, or the lock reason.",
    "Save runs from the button or Enter in a field. A returned promise shows Saving; a rejection shows the Error's message and keeps the typed values.",
    "Discard appears only while there are changes and calls onDiscard.",
    "locked disables the fields, hides the buttons and shows the reason. tone danger draws the bad line and wash and shows your own actions."
  ],
  accessibility: [
    "The card is a section named by its title, and the footer status is a polite live region.",
    "Fields stay in a native form, so Enter submits."
  ],
  limitations: [
    "The host keeps the values and passes dirty; the card does not compare values itself.",
    "Locked fields use a disabled fieldset, so they look disabled rather than read-only."
  ],
  examples: [
    {
      id: "default",
      title: "Save, locked and danger",
      module: "./examples/settings-card/default.tsx",
      states: ["default", "editing", "loading", "success", "error", "read-only"]
    }
  ],
  coverage: [
    {
      axis: "tone",
      expected: ["default", "danger"],
      shown: [
        {
          value: "default",
          exampleId: "default",
          label: "default"
        },
        {
          value: "danger",
          exampleId: "default",
          label: "danger"
        }
      ]
    }
  ],
  guidance: {
    use: [
      "Use SettingsCard for settings someone changes and saves together, one card per decision."
    ],
    avoid: [
      "Wrap settings that apply instantly, such as a lone Switch, or several unrelated settings in one card."
    ],
    decision:
      "Choose SettingsCard when a setting saves explicitly. Use a plain Card and a Toast for settings that apply instantly.",
    rules: [
      {
        id: "settings-card-errors",
        when: "A save fails.",
        do: "Reject with an Error whose message says what failed and what to do, and keep what was typed.",
        avoid: "Clear the fields or show a generic Something went wrong.",
        reason: "People should be able to fix the value and save again without retyping.",
        evidence: [
          "src/components/v4/ui/settings-card.tsx",
          "src/pages/design-system/examples/settings-card/default.tsx"
        ],
        detect: {
          by: "review",
          how: "Clear the name in the example and save; the message explains the fix and the field keeps its value."
        }
      },
      {
        id: "settings-card-danger",
        when: "A setting destroys data.",
        do: "Use tone danger, place the card last on the page and open an AlertDialog that names the object from its action.",
        avoid: "Put a destructive action in an ordinary card's Save button.",
        reason:
          "Destructive settings need a distinct boundary and a confirmation that names what is lost.",
        evidence: [
          "src/components/v4/ui/settings-card.tsx",
          "src/pages/design-system/examples/settings-card/default.tsx"
        ],
        detect: {
          by: "review",
          how: "Check that danger cards come last and that their action confirms with the object's name."
        }
      }
    ],
    states: [
      {
        state: "dirty",
        guidance: "A 6px warn mark and Unsaved changes; Save enables and Discard appears."
      },
      {
        state: "locked",
        guidance: "The lock icon and the reason replace the buttons."
      }
    ],
    antiSlop: [
      {
        do: "Name the setting with a noun and say what it affects in the description.",
        avoid: "Write instructions such as Use this card to change your name.",
        reason: "The title and fields already say what to do."
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
        "npm run ui:dev; open /design-system#settings-card and exercise the documented interaction."
    }
  ]
} satisfies ComponentDefinition;
