import type { ComponentDefinition } from "./types";

export const activityLogDefinition = {
  id: "activity-log",
  title: "Activity log",
  group: "Patterns",
  summary: "Who did what, one line per event, grouped by day with load more.",
  sourceFiles: ["src/components/v4/patterns/activity-log.tsx"],
  exports: ["ActivityLog"],
  referenceNames: ["ActivityLog"],
  behavior: [
    "A plain small List with a section per day whose meta counts its events.",
    "Each event shows the actor's Avatar, the actor and what happened, a Badge for machines and agents, and the time.",
    "Load more adds skeleton rows under the existing rows and keeps the button busy; once everything is in, the footer says Showing 6 of 6 events."
  ],
  accessibility: ["The list keeps existing rows while loading and announces Loading items."],
  limitations: ["For filtering, sorting or exporting events, use a Table such as the audit log."],
  examples: [
    {
      id: "default",
      title: "Recent project activity",
      module: "./examples/activity-log/default.tsx",
      states: ["default", "loading"]
    }
  ],
  coverage: [
    {
      axis: "paging",
      expected: ["more available", "loading more", "all loaded"],
      shown: [
        {
          value: "more available",
          exampleId: "default",
          label: "Grouped by day, load more"
        },
        {
          value: "loading more",
          exampleId: "default",
          label: "Grouped by day, load more"
        },
        {
          value: "all loaded",
          exampleId: "default",
          label: "Grouped by day, load more"
        }
      ]
    }
  ],
  guidance: {
    use: [
      "Use ActivityLog for a short recent history beside an object, written actor first in the past tense."
    ],
    avoid: ["Use it as the audit log, or write events in the passive voice."],
    decision:
      "Choose ActivityLog for a readable recent history. Use Table for the searchable audit log.",
    rules: [
      {
        id: "activity-log-voice",
        when: "An event is written.",
        do: "Start with the actor and use the past tense, with keys and machine names in mono.",
        avoid: "Write passive events such as Secret was updated.",
        reason: "People scan the log for who did something.",
        evidence: ["src/pages/design-system/examples/activity-log/default.tsx"],
        detect: {
          by: "review",
          how: "Read each title for actor first and past tense."
        }
      }
    ],
    states: [
      {
        state: "loading more",
        guidance: "Skeleton rows appear under the rows already there."
      },
      {
        state: "all loaded",
        guidance: "The footer counts the events shown."
      }
    ],
    antiSlop: [
      {
        do: "Keep times short and local; the section names the day.",
        avoid: "Repeat the full date on every row.",
        reason: "The day heading already carries it."
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
        "npm run ui:dev; open /design-system#activity-log and exercise the documented interaction."
    }
  ]
} satisfies ComponentDefinition;
