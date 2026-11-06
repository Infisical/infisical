import type { ComponentDefinition } from "./types";

export const approvalQueueDefinition = {
  id: "approval-queue",
  title: "Approval queue",
  group: "Patterns",
  summary:
    "Requests waiting on you, each moving through new, pending, then resolved or failed in place.",
  sourceFiles: [
    "src/components/v4/patterns/approval-queue.tsx",
    "src/components/v4/patterns/approval-queue.module.css"
  ],
  exports: [
    "ApprovalQueue",
    "ApprovalQueueHeader",
    "ApprovalQueueList",
    "ApprovalQueueGroup",
    "ApprovalQueueItem",
    "ApprovalQueueFooter"
  ],
  referenceNames: ["ApprovalQueue"],
  behavior: [
    "Compose ApprovalQueue from ApprovalQueueHeader (title, count and an actions slot), ApprovalQueueList with ApprovalQueueItem rows and optional ApprovalQueueGroup labels, and an optional ApprovalQueueFooter.",
    "The variant on the root sets the treatment. framed (default) is the tint frame with an eyebrow header band, rows in one bordered inset surface and the footer inside the frame. segmented drops the frame: the header is its own row and each item is a borderless tint card with a small gap between cards; resolved cards fade to half the tint so they keep their edge in dark. divided drops the frame and the cards: items sit on the page separated by line-soft rules.",
    "Passing requests instead of children renders the composed queue for you: header Needs you with the waiting count, one item per request and a View history footer when historyHref is set. It takes the same variant.",
    "Actions sit in a second row under each request's text, so the age ends every title line in the same place.",
    "New requests are unread. Pending shows the pressed action busy and disables its partner. Resolved rows stay with Undo. Failed rows take a bad icon tile, the error line and Retry.",
    "onUndo is optional. Without it resolved rows stay in place with no action, for decisions the host cannot take back."
  ],
  accessibility: [
    "Each request title links to the request and marks the open one as current. Errors are announced as alerts.",
    "ApprovalQueueList's label names the list (Requests waiting on you by default); the header title is visible text, not a heading."
  ],
  limitations: [
    "ApprovalQueueItem and ApprovalQueueGroup must be direct children of ApprovalQueueList or ApprovalQueueGroup (arrays are fine). The list finds its rows by element type, so an item inside a fragment or another wrapper is not counted and the empty message shows.",
    "Groups take a plain label and no count. Use them to split a long queue by day or environment, not to nest queues.",
    "The host owns request state and the approve, undo and retry calls. Leave out onUndo only when the decision really cannot be reversed, and say so in the resolved row's description."
  ],
  examples: [
    {
      id: "default",
      title: "Requests in every state",
      module: "./examples/approval-queue/default.tsx",
      states: ["default", "loading", "success", "error"]
    },
    {
      id: "without-undo",
      title: "Without undo",
      module: "./examples/approval-queue/without-undo.tsx",
      states: ["default", "success"]
    },
    {
      id: "variants",
      title: "Framed, segmented and divided",
      module: "./examples/approval-queue/variants.tsx",
      states: ["default", "loading", "success", "error"]
    },
    {
      id: "grouped",
      title: "Segmented with group labels",
      module: "./examples/approval-queue/grouped.tsx",
      states: ["default", "loading", "success", "error"]
    }
  ],
  coverage: [
    {
      axis: "variant",
      expected: ["framed", "segmented", "divided"],
      shown: [
        { value: "framed", exampleId: "variants", label: "framed" },
        { value: "segmented", exampleId: "variants", label: "segmented" },
        { value: "divided", exampleId: "variants", label: "divided" }
      ]
    },
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
        id: "approval-queue-variant",
        when: "Placing a queue on a page.",
        do: "Keep framed where the queue sits beside other framed panels, use segmented when the queue is the page's main content, and use divided inside a surface that already has an edge, such as a Card or a sheet.",
        avoid:
          "Wrap a segmented or divided queue in a Card or frame of your own, or mark a card with a colored left edge.",
        reason:
          "Each variant brings its own ground. A second wrapper doubles the edge, and state belongs to the whole card's fill, the icon tile and the words.",
        evidence: [
          "src/components/v4/patterns/approval-queue.tsx",
          "src/pages/design-system/examples/approval-queue/variants.tsx"
        ],
        detect: {
          by: "review",
          how: "Check the queue's parent has no frame, Card or border of its own unless the variant is divided."
        }
      },
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
        "npm run dev; open /design-system#approval-queue and exercise the documented interaction."
    }
  ]
} satisfies ComponentDefinition;
