import type { ComponentDefinition } from "./types";

export const loaderDefinition = {
  id: "loader",
  title: "Loader",
  group: "Feedback",
  summary:
    "Fill a region with a labeled Spinner while its first data loads, then show the content.",
  sourceFiles: ["src/components/v4/ui/loader.tsx", "src/components/v4/ui/loader.module.css"],
  exports: ["Loader"],
  referenceNames: ["Loader"],
  behavior: [
    "Loader composes Spinner with its label, description and delay; it adds the area that centers it and marks the region busy.",
    "With loading false it renders its children and nothing else.",
    "The default delay of 300ms keeps fast loads from flashing."
  ],
  accessibility: [
    "Spinner's label carries one polite status announcement; the region sets aria-busy while loading."
  ],
  limitations: [
    "For an inline status beside text, use Spinner with a label directly; Loader only fills areas.",
    "Use Progress for a known count and Skeleton for a known layout."
  ],
  examples: [
    {
      id: "default",
      title: "Base, page and loaded",
      module: "./examples/loader/default.tsx",
      states: ["loading", "default"]
    }
  ],
  coverage: [
    {
      axis: "size",
      expected: ["base", "page"],
      shown: [
        {
          value: "base",
          exampleId: "default",
          label: "base"
        },
        {
          value: "page",
          exampleId: "default",
          label: "page"
        }
      ]
    }
  ],
  guidance: {
    use: [
      "Use Loader around a card, panel, sheet or page body while its first data loads, with a label that names the object."
    ],
    avoid: ["Nest a Loader inside a page Loader, or put one inside a button."],
    decision:
      "Choose Loader for a region whose wait you cannot measure. Use Spinner with a label for inline status, Progress for a known count and Skeleton for a known layout.",
    rules: [
      {
        id: "loader-label",
        when: "A region shows a Loader.",
        do: "Pass a present participle that names the object, such as Loading secrets.",
        avoid: "Use a bare Loading label or no label at all.",
        reason: "People need to know what is loading and where it will appear.",
        evidence: [
          "src/components/v4/ui/loader.tsx",
          "src/pages/design-system/examples/loader/default.tsx"
        ],
        detect: {
          by: "review",
          how: "Read each Loader label and check that it names what loads."
        }
      },
      {
        id: "loader-reconcile",
        when: "Text near the region already says what is happening.",
        do: "Use a bare Spinner or Spinner with a label instead of a Loader.",
        avoid: "Add a second Loader inside a region that already shows one.",
        reason: "One loader per region keeps a single status announcement.",
        evidence: ["src/components/v4/ui/loader.tsx"],
        detect: {
          by: "review",
          how: "Search the region for nested Loader or Spinner status elements."
        }
      }
    ],
    states: [
      {
        state: "loading",
        guidance: "The Spinner centers in the region after the delay, with its label under it."
      },
      {
        state: "loaded",
        guidance: "The children replace the Loader in place."
      }
    ],
    antiSlop: [
      {
        do: "Keep the page loader's assembly as the one entrance flourish.",
        avoid: "Restart the page loader every time data refreshes.",
        reason: "Replaying the assembly reads as a new load."
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
      command: "npm run ui:dev; open /design-system#loader and exercise the documented interaction."
    }
  ]
} satisfies ComponentDefinition;
