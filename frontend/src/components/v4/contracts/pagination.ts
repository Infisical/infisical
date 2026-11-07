import type { ComponentDefinition } from "./types";

export const paginationDefinition = {
  id: "pagination",
  title: "Pagination",
  group: "Navigation",
  summary: "Page ranges, numbered or compact navigation, and manual load more.",
  sourceFiles: [
    "src/components/v4/ui/pagination.tsx",
    "src/components/v4/ui/pagination.module.css"
  ],
  exports: [
    "Pagination",
    "PaginationContent",
    "PaginationItem",
    "PaginationLink",
    "PaginationPrevious",
    "PaginationNext",
    "PaginationEllipsis",
    "PaginationProps",
    "paginationPages"
  ],
  referenceNames: ["Pagination"],
  behavior: [
    "Controlled or default page, numbered gaps, compact Page n of m and manual more.",
    "Totals and ranges stay visible. An empty total shows No results and no controls. More hides its button once every result is shown and shows its spinner while loading; numbered and compact show the spinner beside the range.",
    "The current page is a ghost Button with the shared selected paint, not the primary material. Previous and Next carry chevrons, and drop their labels when the pagination is narrower than 480px. Rows per page is a small v4 Select, labelled by its visible label.",
    "Page-size change requests page one; native links remain available as composed parts.",
    "Native anchor refs propagate through previous/next."
  ],
  accessibility: [
    "Named navigation, aria-current page buttons, labelled previous/next and rows-per-page.",
    "Unavailable page links leave the tab order and do nothing when clicked."
  ],
  limitations: [
    "The host owns fetching and must update controlled page/pageSize and loading state.",
    "pageCount without total can only display Page n of m, never an invented total.",
    "When onLoadMore is supplied, the host must update page or progress after loading. Without onLoadMore, uncontrolled more advances its own page and reports onPageChange.",
    "More requests do not fetch automatically or imply infinite scrolling."
  ],
  related: ["table"],
  examples: [
    {
      id: "default",
      title: "Variants",
      module: "./examples/pagination/default.tsx",
      states: ["controlled", "loading", "keyboard"]
    }
  ],
  coverage: [
    {
      axis: "variant",
      expected: ["numbered", "compact", "more"],
      shown: [
        { value: "numbered", exampleId: "default", label: "numbered" },
        { value: "compact", exampleId: "default", label: "compact" },
        { value: "more", exampleId: "default", label: "more" }
      ]
    },
    {
      axis: "Page ownership",
      expected: ["controlled", "defaultPage"],
      shown: [
        { value: "controlled", exampleId: "default", label: "numbered" },
        { value: "defaultPage", exampleId: "default", label: "compact" }
      ]
    },
    {
      axis: "Total source",
      expected: ["total", "pageCount"],
      shown: [
        { value: "total", exampleId: "default", label: "numbered" },
        { value: "pageCount", exampleId: "default", label: "compact" }
      ]
    }
  ],
  guidance: {
    use: [
      "Choose numbered, compact or more navigation from known result information. Let the host own fetching and controlled progress."
    ],
    avoid: [],
    decision:
      "Choose Pagination for a bounded result set with known pages or explicit load-more progress. Use ScrollArea for one locally loaded region.",
    rules: [
      {
        id: "pagination-retained-results",
        when: "Loading another page can fail.",
        do: "Keep the loaded rows and exact progress visible while pending, then offer an explicit retry beside the failure.",
        avoid: "Blank the result area or increment the loaded count when a request starts.",
        reason: "The count describes available results and must wait for successful loading.",
        evidence: ["src/components/v4/ui/pagination.tsx"],
        detect: {
          by: "review",
          how: "Reject the next page, confirm 10 rows remain, retry and confirm 20 rows only after fulfillment."
        }
      },
      {
        id: "pagination-usage",
        when: "The owner provides onLoadMore for a remote collection.",
        do: "Update host page or progress state after successful loading and pass loading while the request is pending.",
        avoid:
          "Assume a supplied callback automatically advances controlled page state or reuse stale counts after failure.",
        reason: "The host owns fetching and the component cannot infer that new rows arrived.",
        evidence: [
          "src/components/v4/ui/pagination.tsx",
          "src/pages/design-system/examples/pagination/default.tsx"
        ],
        detect: {
          by: "review",
          how: "Reject remote loading and then succeed. Current page/progress changes only with actual host results; boundary controls and loaded/total counts remain truthful."
        }
      },
      {
        id: "pagination-known-quantity",
        when: "A result collection exposes pages or explicit load-more progress.",
        do: "Choose numbered, compact or more from known data, supply total only when measured and reset the controlled page when page size changes.",
        avoid:
          "Invent a record total from pageCount, imply infinite fetching or leave the host page unchanged after a successful onLoadMore.",
        reason:
          "Navigation labels must describe actual results and progress rather than inferred quantities.",
        detect: {
          by: "review",
          how: "Change page size, load another batch and reach empty data. Controlled state updates, ranges are truthful and pageCount-only usage never invents a total."
        },
        evidence: ["src/components/v4/ui/pagination.tsx"]
      }
    ],
    states: [
      {
        state: "boundary",
        guidance: "Disable previous on the first page and next on the last page."
      },
      {
        state: "more",
        guidance:
          "Without onLoadMore, More advances the page itself; with onLoadMore, the host advances it."
      }
    ],
    antiSlop: [
      {
        do: "Show the page or loaded progress beside navigation.",
        avoid: "Use numbered pages when the backend has no stable page count.",
        reason: "The navigation must describe what the data source can actually provide."
      }
    ]
  },
  checks: [
    {
      kind: "runtime",
      command:
        "npm test -- src/components/v4/ui/navigation-helpers.test.tsx src/pages/design-system/examples/pagination/behavior.test.tsx"
    },
    {
      kind: "static",
      command: "npm run type:check"
    },
    {
      kind: "browser",
      command: "Verify both themes, platform labels, page boundaries and narrow containers."
    }
  ]
} satisfies ComponentDefinition;
