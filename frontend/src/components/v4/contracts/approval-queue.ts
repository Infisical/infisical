import type { ComponentDefinition } from "./types";

export const approvalQueueDefinition = {
  id: "approval-queue",
  title: "Approval queue",
  group: "Patterns",
  summary:
    "Requests waiting on you, each moving through new, pending, then resolved or failed in place.",
  sourceFiles: ["src/components/v4/patterns/approval-queue.tsx"],
  exports: ["ApprovalQueue"],
  referenceNames: ["ApprovalQueue"],
  behavior: [
    "A framed List titled Needs you with the waiting count as its action and a View history footer.",
    "Actions sit in a second row under each request's text, so the age ends every title line in the same place.",
    "New requests are unread. Pending shows the pressed action busy and disables its partner. Resolved rows stay with Undo. Failed rows take a bad icon tile, the error line and Retry."
  ],
  accessibility: [
    "Each request title links to the request and marks the open one as current. Errors are announced as alerts."
  ],
  limitations: ["The host owns request state and the approve, undo and retry calls."],
  examples: [
    {
      id: "default",
      title: "Requests in every state",
      module: "./examples/approval-queue/default.tsx",
      states: ["default", "loading", "success", "error"]
    }
  ],
  coverage: [
    {
      axis: "request state",
      expected: ["new", "pending", "resolved", "failed"],
      shown: [
        {
          value: "new",
          exampleId: "default",
          label: "New, pending, resolved with undo, failed with retry"
        },
        {
          value: "pending",
          exampleId: "default",
          label: "New, pending, resolved with undo, failed with retry"
        },
        {
          value: "resolved",
          exampleId: "default",
          label: "New, pending, resolved with undo, failed with retry"
        },
        {
          value: "failed",
          exampleId: "default",
          label: "New, pending, resolved with undo, failed with retry"
        }
      ]
    }
  ],
  guidance: {
    use: [
      "Use ApprovalQueue for requests that need the person's decision, with two actions at most per row."
    ],
    avoid: [
      "Remove a resolved row while the page is open, or confirm an approval that Undo can take back."
    ],
    decision:
      "Choose ApprovalQueue for decisions waiting on someone. Use ActivityLog for what already happened.",
    rules: [
      {
        id: "approval-queue-in-place",
        when: "A request is resolved.",
        do: "Keep the row, put its title in the past tense and offer Undo; drop the header count instead.",
        avoid: "Remove the row as soon as it resolves.",
        reason: "Rows that vanish make people doubt what they just did.",
        evidence: [
          "src/components/v4/patterns/approval-queue.tsx",
          "src/pages/design-system/examples/approval-queue/default.tsx"
        ],
        detect: {
          by: "review",
          how: "Approve a request and check the row stays with Undo and the count drops."
        }
      },
      {
        id: "approval-queue-recovery",
        when: "A request fails.",
        do: "Say what broke and what to do in the error line and offer Retry.",
        avoid: "Show a generic failure with no next step.",
        reason: "The person can only recover if they know how.",
        evidence: ["src/pages/design-system/examples/approval-queue/default.tsx"],
        detect: {
          by: "review",
          how: "Read each failed row's error for a cause and a next step."
        }
      }
    ],
    states: [
      {
        state: "pending",
        guidance: "The pressed action is busy with a present participle; its partner is disabled."
      },
      {
        state: "failed",
        guidance: "A bad icon tile, the error line and Retry."
      }
    ],
    antiSlop: [
      {
        do: "Name the object in mono and the person who asked in the description.",
        avoid: "Title every row Approval request.",
        reason: "People decide by what changes and who asked."
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
        "npm run ui:dev; open /design-system#approval-queue and exercise the documented interaction."
    }
  ]
} satisfies ComponentDefinition;
