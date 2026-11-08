import type { ComponentDefinition } from "./types";

export const floatingActionBarDefinition = {
  id: "floating-action-bar",
  title: "Floating action bar",
  group: "Composites",
  summary:
    "Bulk actions for the current selection, floating over the bottom of the view while anything is selected.",
  sourceFiles: [
    "src/components/v4/ui/floating-action-bar.tsx",
    "src/components/v4/ui/floating-action-bar.module.css",
    "src/components/v4/ui/data-table.tsx"
  ],
  exports: ["FloatingActionBar"],
  referenceNames: ["FloatingActionBar"],
  behavior: [
    "The bar shows while count is above zero and keeps the last count while it leaves. It enters and leaves on the motion springs; reduced motion jumps.",
    "Select all appears while fewer than total are selected.",
    "moreActions always sit in the More menu. Under 400px wide, Select all hides and the noun after the count moves to screen readers only.",
    "The bar is fixed to the window: centered horizontally, space-action-bar-offset (24px) above the bottom edge and size-action-bar (48px) tall. It may cross the sidebar. It portals into the V4Scope overlay container, so it takes the scope's theme, and sits at z-index 40: above page content and sticky table headers, below dialogs, sheets, popovers, menus and toasts on the z-50 overlay layer. Inside a framed V4Scope (portalContainer) it is fixed to that frame instead.",
    "While it shows, the page's scroll area (AppInset) gains bottom padding of size-action-bar plus space-action-bar-offset, so the last rows and the pagination can scroll clear of the bar. A short page that already fits becomes scrollable by that much."
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
      axis: "selection",
      expected: ["partial"],
      shown: [
        {
          value: "partial",
          exampleId: "default",
          label: "Two of five selected"
        }
      ]
    }
  ],
  guidance: {
    use: ["Use FloatingActionBar only for actions on a multiple selection in a list or table."],
    avoid: ["Put a page's own actions in the bar or hide the selection behind it."],
    decision:
      "Choose FloatingActionBar for bulk actions on a selection. Page actions belong in PageHeader and row actions in the table's actions tail, the sticky last column.",
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
        id: "floating-action-bar-window",
        when: "A list or table page shows bulk actions for its selection.",
        do: "Render one FloatingActionBar for the selection, through DataTable's actionBar when a DataTable holds it, and let it sit at the bottom center of the window.",
        avoid:
          "Position the bar yourself, pin it inside the table or a card, or pad the page for it by hand.",
        reason:
          "One place on every page makes the bar easy to find, and the bar pads the page's scroll area itself, so the last rows and the pagination can scroll clear of it.",
        evidence: [
          "src/components/v4/ui/floating-action-bar.tsx",
          "src/components/v4/ui/data-table.tsx"
        ],
        detect: {
          by: "review",
          how: "Select rows on a list page whose table ends near the bottom of the window: the bar sits at the bottom center of the window, and scrolling to the end shows the pagination above it."
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
        "npm run dev; open /design-system#floating-action-bar and exercise the documented interaction."
    }
  ]
} satisfies ComponentDefinition;
