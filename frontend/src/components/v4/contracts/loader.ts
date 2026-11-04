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
    "The default delay of 300ms keeps fast loads from flashing.",
    "Loader is for content whose shape is unknown. When the loaded shape is known (rows, cards, a chart), show Skeleton shapes that match the loaded state instead, as the reload in the example does.",
    "Size page is the page loader: it fills a page body while the page or its lazy chunk loads, before any of the page is on screen."
  ],
  accessibility: [
    "Spinner's label carries one polite status announcement; the region sets aria-busy while loading."
  ],
  limitations: [
    "For an inline status beside text, use Spinner with a label directly; Loader only fills areas.",
    "Use Progress for a known count and Skeleton for a known layout. A blanket Loader over rows, cards or a chart whose shape is known is a misuse."
  ],
  examples: [
    {
      id: "default",
      title: "Base, page and a skeleton reload",
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
      "Use the page loader (size page) as the Suspense fallback for a page or a lazy page chunk, and for a page whose first data has not arrived, labeled with the page it loads.",
      "Use Loader at base size around a card, panel or sheet of unknown shape while its first data loads, with a label that names the object."
    ],
    avoid: [
      "Nest a Loader inside a page Loader, or put one inside a button.",
      "Cover a table that is already on screen with a Loader; use its loading rows."
    ],
    decision:
      "Page loader, Skeleton or the table's loading rows: while a whole page or its chunk loads and none of it is on screen, use the page loader. Once the page has rendered, show Skeleton shapes for a card, panel or chart of known shape, and the table's loading rows (DataTable loading with loadingRows) for rows inside a table that is on screen. Use Spinner with a label for inline status and Progress for a known count.",
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
        id: "loader-unknown-shape",
        when: "A region is waiting for data.",
        do: "Use Loader only when the shape of the result is unknown. When it is known, show Skeleton shapes like the loaded state and announce the wait with a status.",
        avoid: "Cover known rows, cards or a chart with a blanket Loader.",
        reason:
          "Matching shapes keep the layout still and show what is coming; a centered spinner hides both.",
        evidence: [
          "src/components/v4/ui/loader.tsx",
          "src/pages/design-system/examples/loader/default.tsx"
        ],
        detect: {
          by: "review",
          how: "For each Loader, check whether the loaded content has a known shape. If it does, replace the Loader with Skeleton shapes at the same size."
        }
      },
      {
        id: "loader-page-level",
        when: "A whole page, or the lazy chunk that renders it, is loading and none of it is on screen yet.",
        do: "Render the page loader, Loader size page, as the Suspense fallback or the page body, labeled with the page it loads.",
        avoid:
          "Show a Spinner, bare Loading text or a blank area, or put the page loader over a table or region inside a page that has already rendered.",
        reason:
          "One page-level treatment tells people the whole page is on its way; inside a rendered page, Skeleton and the table's loading rows keep the layout still.",
        evidence: [
          "src/components/v4/ui/loader.tsx",
          "src/pages/design-system/examples/loader/default.tsx"
        ],
        detect: {
          by: "review",
          how: "Check each Suspense fallback and page-level loading branch renders Loader size page; the suspense-fallback lint check of rule/page-loading catches single-line fallbacks."
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
      command: "npm run dev; open /design-system#loader and exercise the documented interaction."
    }
  ]
} satisfies ComponentDefinition;
