import type { ComponentDefinition } from "./types";

export const accessListDefinition = {
  id: "access-list",
  title: "Access list",
  group: "Patterns",
  summary:
    "Who can reach a project: a member per row that opens them, multiple selection with the bulk bar and a locked owner.",
  sourceFiles: [
    "src/components/v4/patterns/access-list.tsx",
    "src/components/v4/patterns/patterns.module.css"
  ],
  exports: ["AccessList"],
  referenceNames: ["AccessList"],
  behavior: [
    "A toolbar above the list says how many have access and offers Add member.",
    "Members are link rows in a framed List with selection, an Avatar, the role as a Badge, how they got access, last use and a row menu.",
    "Selecting rows raises a contained FloatingActionBar with Revoke access. The owner cannot be selected and its menu is disabled.",
    "After a revoke, a status line in the list footer says how many lost access and Undo restores them."
  ],
  accessibility: [
    "The List's select-all and row checkboxes are named for the member; the bulk bar is a named toolbar with a count status.",
    "Machine and agent names are set in mono."
  ],
  limitations: ["The host owns the members and persists revokes and restores."],
  examples: [
    {
      id: "default",
      title: "Members of a project",
      module: "./examples/access-list/default.tsx",
      states: ["default", "controlled", "keyboard"]
    }
  ],
  coverage: [
    {
      axis: "row state",
      expected: ["owner locked", "selectable", "current"],
      shown: [
        {
          value: "owner locked",
          exampleId: "default",
          label: "Owner locked, multiple selection with the bulk bar"
        },
        {
          value: "selectable",
          exampleId: "default",
          label: "Owner locked, multiple selection with the bulk bar"
        },
        {
          value: "current",
          exampleId: "default",
          label: "Owner locked, multiple selection with the bulk bar"
        }
      ]
    }
  ],
  guidance: {
    use: [
      "Use AccessList for who can reach one project or resource, with roles in words and temporary access saying when it ends."
    ],
    avoid: ["Color roles, or confirm every revoke with a dialog when Undo can restore it."],
    decision:
      "Choose AccessList for a membership list with bulk changes. Use a Table when people need to sort, filter or export members.",
    rules: [
      {
        id: "access-list-roles",
        when: "A member has a role or temporary access.",
        do: "Name the role in a Badge and say when temporary access ends, such as Read, 1 hour.",
        avoid: "Color-code roles or hide the expiry in a tooltip.",
        reason: "Words survive both themes and screen readers; color alone does not.",
        evidence: [
          "src/components/v4/patterns/access-list.tsx",
          "src/pages/design-system/examples/access-list/default.tsx"
        ],
        detect: {
          by: "review",
          how: "Read each row's badge and description for the role and any expiry."
        }
      },
      {
        id: "access-list-owner",
        when: "A member cannot lose access, such as the owner.",
        do: "Make the row unselectable, disable its menu and say why in the description.",
        avoid: "Let the owner be selected and fail the bulk action.",
        reason: "A control that cannot succeed should not be offered.",
        evidence: ["src/components/v4/patterns/access-list.tsx"],
        detect: {
          by: "review",
          how: "Select all and check the owner stays unselected."
        }
      }
    ],
    states: [
      {
        state: "revoked",
        guidance: "Rows leave the list and the footer offers Undo."
      },
      {
        state: "empty",
        guidance: "A compact empty state says nobody else has access yet."
      }
    ],
    antiSlop: [
      {
        do: "Say how each member got access in plain words.",
        avoid: "Show internal policy identifiers as the description.",
        reason: "People decide on access by who granted it and why."
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
        "npm run ui:dev; open /design-system#access-list and exercise the documented interaction."
    }
  ]
} satisfies ComponentDefinition;
