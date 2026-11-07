import type { ComponentDefinition } from "./types";

export const errorStateDefinition = {
  id: "error-state",
  title: "Error state",
  group: "Patterns",
  summary: "The 404 and crash fallback, inside the shell or as a full page.",
  sourceFiles: [
    "src/components/v4/patterns/error-state.tsx",
    "src/components/v4/patterns/error-state.module.css"
  ],
  exports: ["ErrorState"],
  referenceNames: ["ErrorState"],
  behavior: [
    "preset not-found shows Page not found, one line, an accent Go to organization home link and Go back. preset forbidden shows You don't have access, one line, an accent Go to organization home link and Go back, with no Reload. preset crash shows Something went wrong, one line, an accent Reload, Go to organization home and a closed Error details disclosure.",
    "layout auto renders in the content area when an AppShell is above it, so the sidebar and top bar stay, and full-page when there is none, such as when the shell itself failed. full-page is fixed over its containing block: the viewport in the app, the stage in the workbench. Pass in-shell or full-page to force one.",
    "Error details holds one mono block with the error name and message, each details line (request id, status, route, time) and, in development builds or with showStack, the stack. Its Copy details button copies that same text.",
    "A quiet cell mark sits above the title: for not-found one cell is a dashed gap, for forbidden one cell is hatched shut, for crash one accent cell is knocked out of the grid.",
    "actions holds the page's own flows, such as Request access for a project the person is not a member of. They render after the preset's primary action and before its secondary one (Go back, or Go to organization home on crash), so the preset keeps its order and its one accent; pass outline Buttons.",
    "onReport runs once per error when crash mounts, so the host can send it to error reporting. homeHref defaults to /; onHome runs before the link navigates. onBack and onReload default to history back and a full reload."
  ],
  accessibility: [
    "The title is the page's h1. Actions are a real link and buttons, and Error details is a disclosure button with aria-expanded."
  ],
  limitations: [
    "ErrorState imports nothing from the app. The host classifies the error (403 pages, project access), reads the request id from the response, sets the page title and reports to Sentry or PostHog through onReport.",
    "full-page needs V4Scope above it for tokens; inside the v4 app the root route already provides it."
  ],
  examples: [
    {
      id: "default",
      title: "Not found and crash",
      module: "./examples/error-state/default.tsx",
      states: ["default", "error"]
    },
    {
      id: "forbidden",
      title: "Forbidden with a page action",
      module: "./examples/error-state/forbidden.tsx",
      states: ["default", "disabled"]
    }
  ],
  coverage: [
    {
      axis: "preset",
      expected: ["not-found", "forbidden", "crash"],
      shown: [
        { value: "not-found", exampleId: "default", label: "not-found, in the shell" },
        { value: "forbidden", exampleId: "forbidden", label: "forbidden, in the shell" },
        { value: "crash", exampleId: "default", label: "crash, in the shell" }
      ]
    },
    {
      axis: "layout",
      expected: ["in-shell", "full-page"],
      shown: [
        { value: "in-shell", exampleId: "default", label: "crash, in the shell" },
        { value: "full-page", exampleId: "default", label: "crash, full-page" }
      ]
    }
  ],
  guidance: {
    use: [
      "Use ErrorState as the route notFoundComponent and errorComponent, and for a resource the API says does not exist."
    ],
    avoid: [
      "Add a second description, a status badge, a joke headline or marketing copy, or show the stack in production."
    ],
    decision:
      "Choose ErrorState when the whole page cannot render. Use EmptyState for an empty list and Alert for an error inside a page that still works.",
    rules: [
      {
        id: "error-state-host-owns-reporting",
        when: "A route error reaches the fallback.",
        do: "Pass the error, the request id and route as details, and send the error to reporting from onReport.",
        avoid:
          "Import Sentry, PostHog or axios into the pattern, or report from the pattern itself.",
        reason:
          "The v4 bundle fence keeps app imports out of components/v4, and the host is the one that knows which errors to classify and report.",
        evidence: [
          "src/components/v4/patterns/error-state.tsx",
          "src/pages/design-system/examples/error-state/default.tsx"
        ],
        detect: {
          by: "review",
          how: "Read the route's errorComponent: it passes error, details and onReport, and the pattern imports nothing from @app outside components/v4."
        }
      }
    ],
    states: [
      {
        state: "error",
        guidance:
          "Keep Error details closed by default; it carries the message, the request id and, in development, the stack."
      }
    ],
    antiSlop: [
      {
        do: "Say what happened in one short line.",
        avoid: "Write a headline joke or a reassurance line about secrets.",
        reason: "The page only needs to say what broke and where to go next."
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
        "npm run dev; open /design-system#error-state and exercise the documented interaction."
    }
  ]
} satisfies ComponentDefinition;
