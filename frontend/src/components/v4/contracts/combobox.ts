import type { ComponentDefinition } from "./types";

export const comboboxDefinition = {
  id: "combobox",
  title: "Combobox",
  group: "Forms",
  summary: "Search and choose one option from a provided list.",
  sourceFiles: [
    "src/components/v4/ui/combobox.tsx",
    "src/components/v4/ui/picker.module.css",
    "src/components/v4/lib/use-option-creation.ts"
  ],
  exports: ["Combobox", "ComboboxOption", "ComboboxProps"],
  referenceNames: ["Combobox"],
  behavior: [
    "Single selection uses Radix Popover and cmdk; multiple selection composes the shared ARIA listbox with removable chips and empty-query Backspace.",
    "Controlled or local value; case-insensitive label and metadata filtering; optional awaited creation.",
    "Creation receives a host AbortSignal; changing the query, closing or unmounting aborts and invalidates the prior request.",
    "A host DOMException named AbortError is cancellation. It preserves the query without failure feedback; other failures remain retryable."
  ],
  accessibility: [
    "Caller supplies a visible or programmatic label.",
    "Disabled options cannot be selected."
  ],
  limitations: [
    "Do not treat this in-memory picker as a remote-search or virtualized-results implementation.",
    "Creation persistence belongs to the host. Aborting suppresses obsolete UI results and asks the host to cancel; it cannot undo an already committed server write."
  ],
  examples: [
    {
      id: "default",
      title: "Single selection",
      module: "./examples/combobox/default.tsx",
      states: ["controlled", "keyboard"]
    },
    {
      id: "multiple",
      title: "Multiple environment draft",
      module: "./examples/combobox/multiple.tsx",
      states: ["controlled", "disabled", "keyboard"]
    },
    {
      id: "creation",
      title: "Creation",
      module: "./examples/combobox/creation.tsx",
      states: ["controlled"]
    }
  ],
  coverage: [
    {
      axis: "mode",
      expected: ["single", "multiple"],
      shown: [
        {
          value: "single",
          exampleId: "default",
          label: "Single environment"
        },
        {
          value: "multiple",
          exampleId: "multiple",
          label: "Visible environments"
        }
      ]
    },
    {
      axis: "state",
      expected: [
        "empty options",
        "empty search",
        "invalid",
        "disabled",
        "disabled selected",
        "creation unavailable",
        "pending creation",
        "failed creation and retry",
        "AbortError cancellation",
        "abort on close/query"
      ],
      shown: [
        {
          value: "disabled selected",
          exampleId: "multiple",
          label: "Audit"
        },
        {
          value: "creation unavailable",
          exampleId: "default",
          label: "Single environment"
        },
        {
          value: "pending creation",
          exampleId: "creation",
          label: "Search and create"
        },
        {
          value: "abort on close/query",
          exampleId: "creation",
          label: "Environment"
        }
      ],
      omitted: [
        {
          value: "empty options",
          reason:
            "Empty, invalid and disabled use the shared field surface, which the Input and Field examples show once."
        },
        {
          value: "empty search",
          reason:
            "Empty, invalid and disabled use the shared field surface, which the Input and Field examples show once."
        },
        {
          value: "invalid",
          reason:
            "Empty, invalid and disabled use the shared field surface, which the Input and Field examples show once."
        },
        {
          value: "disabled",
          reason:
            "Empty, invalid and disabled use the shared field surface, which the Input and Field examples show once."
        },
        {
          value: "failed creation and retry",
          reason:
            "Creation rejection and cancellation semantics are verified through the component contract; no failure-injection controls appear in Human specimens."
        },
        {
          value: "AbortError cancellation",
          reason:
            "Creation rejection and cancellation semantics are verified through the component contract; no failure-injection controls appear in Human specimens."
        }
      ]
    },
    {
      axis: "composition",
      expected: ["mono identifier", "custom empty text"],
      shown: [],
      omitted: [
        {
          value: "mono identifier",
          reason:
            "The mono prop only changes the typeface of the option labels; no example sets it."
        },
        {
          value: "custom empty text",
          reason: "The emptyText prop only changes the no-match sentence; no example sets it."
        }
      ]
    }
  ],
  guidance: {
    use: [
      "Use a searchable local value set when labels need filtering. Add creation only when a host callback can create the actual option."
    ],
    avoid: [],
    decision:
      "Choose Combobox when a known option list needs search. Use Select for a short grouped choice and CommandMenu for executing actions.",
    rules: [
      {
        id: "combobox-usage",
        when: "Several options share similar display labels.",
        do: "Give each option a stable unique value and useful searchable text; keep the selected label visible when filtering.",
        avoid:
          "Use array indexes as identity or commit the first result just because the query changed.",
        reason: "Filtering narrows candidates without choosing a value.",
        evidence: [
          "src/components/v4/ui/combobox.tsx",
          "src/pages/design-system/examples/combobox/default.tsx"
        ],
        detect: {
          by: "review",
          how: "Filter similar options, highlight one and cancel. Query/highlight do not change the committed value until selection, and distinct stable option ids survive reordered results."
        }
      },
      {
        id: "combobox-searchable-value",
        when: "A field searches an in-memory set or offers host-backed creation.",
        do: "Use stable option values, keep the visible field purpose separate from the query and pass onCreate only for a real cancellable host operation.",
        avoid:
          "Treat an empty search as an empty collection, create duplicate values or imply search is remote or virtualized.",
        reason:
          "Query state, selected identity and persisted creation describe different things and must not be conflated.",
        detect: {
          by: "review",
          how: "Search without matches, reject creation and retry, then close during a pending request. Selected identity stays correct and obsolete results do not select themselves."
        },
        evidence: [
          "src/components/v4/ui/combobox.tsx",
          "src/pages/design-system/examples/combobox/default.tsx"
        ]
      }
    ],
    states: [
      {
        state: "empty",
        guidance: "Keep the query and state that no options match."
      },
      {
        state: "disabled",
        guidance:
          "Show why a known option cannot be chosen without removing the current selection's meaning."
      }
    ],
    antiSlop: [
      {
        do: "Make option labels distinguish the resources people search for.",
        avoid:
          "Populate results with repeated icons and identical names that differ only in hidden values.",
        reason: "Search cannot resolve choices whose visible information is indistinguishable."
      },
      {
        do: "Retain the query after failed creation and let the host commit only after the awaited local operation succeeds.",
        avoid:
          "Claim that an option was created on click or turn AbortError cancellation into failure feedback.",
        reason: "Pending, rejection and cancellation have different outcomes and recovery paths."
      }
    ]
  },
  checks: [
    {
      kind: "static",
      command: "npm run type:check"
    },
    {
      kind: "runtime",
      command: "npm test -- src/components/v4/ui/foundation-controls.test.tsx"
    },
    {
      kind: "browser",
      command:
        "npm run ui:dev; open /design-system#combobox and exercise the documented interaction."
    }
  ]
} satisfies ComponentDefinition;
