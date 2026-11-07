import type { ComponentDefinition } from "./types";

export const rowLinkDefinition = {
  id: "row-link",
  title: "Row link",
  group: "Navigation",
  summary:
    "A typed route link whose target stretches over its table row or Card, with a disabled fallback.",
  sourceFiles: ["src/components/v4/ui/row-link.tsx", "src/components/v4/ui/row-link.module.css"],
  exports: ["RowLink"],
  referenceNames: ["RowLink"],
  behavior: [
    "RowLink is TanStack Router's createLink over an anchor, so to, params, search and hash are typed against the route tree and the href is real.",
    "Its ::after covers the nearest table row or Card. The row or Card becomes the positioning context through :has(), so hosts need no linked prop.",
    "Buttons, inputs, checkboxes, comboboxes, switches, other links, tooltip triggers and anything marked data-row-interactive inside that host sit above the overlay and keep their own click.",
    "The link text truncates with an ellipsis; pass title to show the full value on hover.",
    "A trailing chevron-right marks the row as navigation. The link grows to fill its cell's flex line, so the chevron sits at the trailing edge, at size-glyph in muted, and turns ink while the row or Card is hovered or holds focus. It takes no width a column did not already have and does not change the row height. Pass chevron={false} for the rare host that should not show it, such as a Card whose whole surface already reads as a link.",
    "disabled renders a span with no href and no overlay, in muted text, so the row stays visible but does not navigate."
  ],
  accessibility: [
    "The row's accessible target is a real link, so it supports middle-click, open in new tab, copy link and the browser's status bar.",
    "Keyboard focus lands on the link and draws the ink focus outline around the whole row or Card.",
    "The disabled span has role link and aria-disabled true, so it is announced as an unavailable link.",
    "The chevron is decorative and aria-hidden, so the link's accessible name is its text alone."
  ],
  limitations: [
    "Use one RowLink per row or Card; a second stretched target would cover the first. When the whole Card is the link and its name should wrap, use CardLink, which shares these semantics.",
    "Do not combine RowLink with DataTable's onRowActivate on the same table. Both would claim the row, and the row would take two tab stops.",
    "Controls that position themselves absolutely keep their own stacking; if one sits under the overlay, mark it data-row-interactive and give it a position."
  ],
  related: ["table", "card", "list"],
  examples: [
    {
      id: "default",
      title: "DataTable rows and a Card",
      module: "./examples/row-link/default.tsx",
      states: ["default", "disabled", "keyboard"]
    }
  ],
  coverage: [
    {
      axis: "host",
      expected: ["DataTable row", "Card"],
      shown: [
        {
          value: "DataTable row",
          exampleId: "default",
          label: "DataTable rows open their page; the last row is disabled"
        },
        {
          value: "Card",
          exampleId: "default",
          label: "Card opens the Detail page without a chevron; the copy button keeps its own click"
        }
      ]
    },
    {
      axis: "state",
      expected: ["enabled", "disabled"],
      shown: [
        {
          value: "enabled",
          exampleId: "default",
          label: "DataTable rows open their page; the last row is disabled"
        },
        {
          value: "disabled",
          exampleId: "default",
          label: "DataTable rows open their page; the last row is disabled"
        }
      ]
    }
  ],
  guidance: {
    use: [
      "Use RowLink in the primary cell of a table row, or the title of a Card, when activating it navigates to another route."
    ],
    avoid: [
      "Do not use RowLink when activation opens a sheet or dialog or changes state on the page; that is DataTable's onRowActivate."
    ],
    decision:
      "Choose RowLink when the row is a link to a URL: people can open it in a new tab, copy it and see it in the status bar. Choose DataTable's onRowActivate when activating the row runs an in-page action such as opening a details Sheet. Use one or the other per table.",
    rules: [
      {
        id: "row-link-vs-row-activate",
        when: "A whole DataTable row should respond to a click.",
        do: "Use RowLink in the primary cell when the row navigates, and onRowActivate when it opens something in place.",
        avoid: "Navigate from onRowActivate with router.navigate, or set both on one table.",
        reason:
          "Navigation from a click handler has no href, so new-tab, copy link and middle-click stop working; setting both gives each row two targets and two tab stops.",
        evidence: [
          "src/components/v4/ui/row-link.tsx",
          "src/pages/design-system/examples/row-link/default.tsx"
        ],
        detect: {
          by: "review",
          how: "ui:lint row-activate-navigates flags an onRowActivate that navigates, inline or through a function in the same file. Check imported handlers and tables that pass onRowActivate while rendering RowLink by hand."
        }
      },
      {
        id: "row-link-sheet-row",
        when: "Activating a row opens its record in a Sheet or Dialog on the same page.",
        do: "Render the name as a link Button that runs the table's onRowActivate handler, so the row draws no chevron. When the sheet is addressable by URL and the name is a RowLink to it, pass chevron={false}.",
        avoid:
          "Keep RowLink's chevron on a row that never leaves the page, or add a chevron or Open action to the actions tail for the same sheet.",
        reason:
          "The chevron promises a new page; on a row that opens a sheet it sends the person somewhere they never go.",
        evidence: [
          "src/components/v4/ui/row-link.tsx",
          "src/pages/design-system/examples/row-link/default.tsx"
        ],
        detect: {
          by: "review",
          how: "Open each sheet-opening table and check that no row shows a chevron and the actions tail has no Open action."
        }
      },
      {
        id: "row-link-chevron",
        when: "A table row navigates to another page through RowLink.",
        do: "Keep the default trailing chevron and place RowLink last in its cell's flex line, so the chevron lands on the cell's trailing edge.",
        avoid:
          "Draw a second chevron or arrow in the row, put badges or hints after the RowLink, or turn the chevron off on a row that goes to another page.",
        reason:
          "The chevron is the row's only visual sign that activating it navigates; content after the link pushes it off the trailing edge.",
        evidence: [
          "src/components/v4/ui/row-link.tsx",
          "src/pages/design-system/examples/row-link/default.tsx"
        ],
        detect: {
          by: "test",
          test: "src/components/v4/ui/row-link.test.tsx",
          how: "Renders an enabled, a disabled and a chevron={false} RowLink and checks the aria-hidden chevron is present on the first two and absent on the third."
        }
      }
    ],
    states: [
      {
        state: "hover",
        guidance:
          "Table rows keep their own hover tint; a Card gets a translucent ink overlay. The chevron turns from muted to ink."
      },
      {
        state: "disabled",
        guidance: "Muted text, no overlay and no href; give the reason elsewhere in the row."
      }
    ],
    antiSlop: [
      {
        do: "Keep row actions as ordinary buttons in the table's actions tail, the sticky last column, outside the link.",
        avoid: "Wrap the whole row in an anchor.",
        reason: "An anchor around buttons is invalid nesting and swallows their clicks."
      }
    ]
  },
  checks: [
    { kind: "runtime", command: "npm test -- src/components/v4/ui/row-link.test.tsx" },
    { kind: "static", command: "npm run type:check" },
    {
      kind: "browser",
      command:
        "Click a row and a row's action in both themes; middle-click and keyboard focus the link."
    }
  ]
} satisfies ComponentDefinition;
