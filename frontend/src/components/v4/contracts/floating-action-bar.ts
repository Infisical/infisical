import type { ComponentDefinition } from "./types";

export const floatingActionBarDefinition = {
  id: "floating-action-bar",
  title: "Floating action bar",
  group: "Composites",
  summary:
    "Bulk actions for the current selection, floating over the bottom of the view while anything is selected.",
  sourceFiles: [
    "src/components/v4/ui/floating-action-bar.tsx",
    "src/components/v4/ui/floating-action-bar.module.css"
  ],
  exports: ["FloatingActionBar"],
  referenceNames: ["FloatingActionBar"],
  behavior: [
    "The bar shows while count is above zero and keeps the last count while it leaves. It enters and leaves on the motion springs; reduced motion jumps.",
    "Select all appears while fewer than total are selected.",
    "moreActions always sit in the More menu. Under 400px wide, Select all hides and the noun after the count moves to screen readers only.",
    "fixed sits 24px above the viewport's bottom; contained sits 16px above the nearest positioned ancestor's bottom."
  ],
  accessibility: [
    "The bar is a named toolbar: Left and Right move between its buttons, Home and End jump, and Escape clears the selection.",
    "The count is a status. When the bar leaves with focus inside it, focus returns to where it came from."
  ],
  limitations: [
    "Labeled actions do not yet move into More by measured width; keep two or three labeled actions and put the rest in moreActions."
  ],
  examples: [
    {
      id: "default",
      title: "Bulk actions over a list",
      module: "./examples/floating-action-bar/default.tsx",
      states: ["default", "controlled", "keyboard"]
    }
  ],
  coverage: [
    {
      axis: "placement",
      expected: ["fixed", "contained"],
      shown: [
        {
          value: "contained",
          exampleId: "default",
          label: "contained, two of five selected"
        }
      ],
      omitted: [
        {
          value: "fixed",
          reason:
            "Fixed placement would float over the whole workbench; contained shows the same bar inside its stage."
        }
      ]
    }
  ],
  guidance: {
    use: ["Use FloatingActionBar only for actions on a multiple selection in a list or table."],
    avoid: ["Put a page's own actions in the bar or hide the selection behind it."],
    decision:
      "Choose FloatingActionBar for bulk actions on a selection. Page actions belong in PageHeader and row actions in the row.",
    rules: [
      {
        id: "floating-action-bar-undo",
        when: "A bulk action changes or removes items.",
        do: "Say how many it touched and offer Undo after it, unless the loss is permanent.",
        avoid: "Ask for confirmation before every bulk action.",
        reason: "Undo keeps the flow fast and still recovers mistakes.",
        evidence: ["src/pages/design-system/examples/floating-action-bar/default.tsx"],
        detect: {
          by: "review",
          how: "Run Delete in the example and check that the result names the count."
        }
      },
      {
        id: "floating-action-bar-order",
        when: "The bar has several actions.",
        do: "Order actions by importance with the danger action last and the rest in moreActions.",
        avoid: "Lead with Delete or show every action as a labeled button.",
        reason: "The bar has one line and never wraps.",
        evidence: ["src/components/v4/ui/floating-action-bar.tsx"],
        detect: {
          by: "review",
          how: "Read the actions left to right."
        }
      }
    ],
    states: [
      {
        state: "busy",
        guidance:
          "A running action shows its button's loading state and the bar stays up until it finishes."
      },
      {
        state: "empty",
        guidance: "With no selection the bar is not rendered."
      }
    ],
    antiSlop: [
      {
        do: "Keep labels to a verb, such as Move or Delete.",
        avoid: "Repeat the count in every action label.",
        reason: "The count already sits at the start of the bar."
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
        "npm run ui:dev; open /design-system#floating-action-bar and exercise the documented interaction."
    }
  ]
} satisfies ComponentDefinition;
