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
  exports: [
    "Combobox",
    "ComboboxCreation",
    "ComboboxCreationFormProps",
    "ComboboxOption",
    "ComboboxProps"
  ],
  referenceNames: ["Combobox"],
  behavior: [
    "Single selection uses Radix Popover and cmdk; multiple selection composes the shared ARIA listbox with removable chips and empty-query Backspace. Chips sit on a tint; a chip that cannot be removed (locked, for example required by policy) drops the tint and its text goes muted so the whole chip reads as disabled, and its remove button stays visible but disabled.",
    "ArrowDown or ArrowUp on the focused closed trigger opens the list with focus in the search field and the active option highlighted, like Enter and Space.",
    "Multiple mode anchors its list to the whole field, chips included, and re-anchors on every open, so the list sits under the field inside a Dialog or Sheet too.",
    "Multiple mode lists options with checkbox marks and no Select all bar. Removing a chip with Enter, Space, Backspace or Delete on its remove button moves focus to the next removable chip, else the previous one, else the trigger; focus never falls to the page.",
    "Controlled or local value; case-insensitive label and metadata filtering; optional awaited creation.",
    "onSearch(query) turns on async search for single selection: the Combobox stops filtering and renders options as the host passes them, calls onSearch on every query change and with an empty string when it closes with a query, and keeps the label of the chosen option on the trigger after the results move on. Debouncing and request cancellation stay with the host. loading shows the pixel Spinner in the search row and disables the creation row until results settle. With no results, a status line reads Searching… while loading and emptyText after, above the creation row when there is one. The creation row works the same in async mode.",
    "defaultOpen opens the list on mount, for a picker that is the first step of a flow. Focus moving outside the list closes it unless closeOnFocusOutside is false, which is the default when defaultOpen is set, so a Dialog or Sheet taking focus on mount does not close a list that opened with it; outside pointer presses and Escape still close it. Multiple mode with clearable adds a Clear all button after the chips; it removes every removable chip, keeps locked ones and returns focus to the trigger.",
    "Creation receives a host AbortSignal; changing the query, closing or unmounting aborts and invalidates the prior request.",
    "A host DOMException named AbortError is cancellation. It preserves the query without failure feedback; other failures remain retryable.",
    "creation picks how the Create row works for single selection. mode inline takes onCreate and behaves exactly like the onCreate prop, which stays as its shorthand. mode dialog always ends the list with a plus row named by label, after a separator when options are listed, so an empty list still offers it. Choosing it closes the list and opens a Dialog titled title with description, the form from renderForm and a footer with Cancel and submitLabel (default Create), which submits the form whose id is formId.",
    "renderForm receives query (the trimmed search text), formId, complete, dismiss, onDirtyChange and onPendingChange, and remounts on every open. complete(option) selects the option (its label shows on the trigger even before the host adds it to options), closes the Dialog and returns focus to the trigger; a complete that arrives after the Dialog was dismissed is ignored. onPendingChange(true) makes the Dialog pending, which blocks Escape, outside clicks and the corner close, disables Cancel and shows the submit Button loading.",
    "Escape, an outside click, the corner close, Cancel and dismiss all go through useDiscardChangesGuard: with the form dirty (onDirtyChange(true)) they open DiscardChangesAlertDialog with discardTitle and discardDescription, and only Discard closes; a clean form closes at once. A submit inside the Dialog never reaches a form around the Combobox.",
    "disabledReason on either mode keeps the Create row visible but disabled, with the reason beside its label (disable, do not hide). Gate it on the create permission."
  ],
  accessibility: [
    "Caller supplies a visible or programmatic label.",
    "Disabled options cannot be selected."
  ],
  limitations: [
    "mono is for a picker of machine values such as secret keys, key IDs or folder paths; a picker of projects, environments or other named entities stays in the sans (rule/mono-machine-values).",
    "Without onSearch, filtering is in memory. Async search does not virtualize results; keep the host's result page short.",
    "onSearch and loading are single-selection props. Multiple mode filters its options in memory and orders the value by them, so it needs every selectable option up front.",
    "Creation persistence belongs to the host. Aborting suppresses obsolete UI results and asks the host to cancel; it cannot undo an already committed server write.",
    "Dialog creation is single selection only, in a fixed-width Dialog. A multi-step creation belongs in a Sheet the host opens from a mode inline onCreate."
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
    },
    {
      id: "async",
      title: "Async search",
      module: "./examples/combobox/async.tsx",
      states: ["controlled", "loading", "empty"]
    },
    {
      id: "dialog-creation",
      title: "Create in a dialog",
      module: "./examples/app-connection-form/default.tsx",
      states: ["controlled", "loading", "disabled"]
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
        "abort on close/query",
        "dialog creation",
        "creation disabled with reason"
      ],
      shown: [
        {
          value: "dialog creation",
          exampleId: "dialog-creation",
          label: "AWS connection"
        },
        {
          value: "creation disabled with reason",
          exampleId: "dialog-creation",
          label: "Without permission to create connections"
        },
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
        },
        {
          value: "empty search",
          exampleId: "async",
          label: "Searches the server as you type"
        }
      ],
      omitted: [
        {
          value: "empty options",
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
      axis: "search",
      expected: ["in memory", "async", "async loading"],
      shown: [
        { value: "in memory", exampleId: "default", label: "Single environment" },
        { value: "async", exampleId: "async", label: "Searches the server as you type" },
        { value: "async loading", exampleId: "async", label: "Searches the server as you type" }
      ]
    },
    {
      axis: "composition",
      expected: ["mono identifier", "custom empty text"],
      shown: [
        { value: "custom empty text", exampleId: "async", label: "Searches the server as you type" }
      ],
      omitted: [
        {
          value: "mono identifier",
          reason:
            "mono is for a picker of machine values such as secret keys, key IDs or hosts. The examples pick projects and environments, names people chose, which stay in the sans (rule/mono-machine-values)."
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
        id: "combobox-dialog-creation",
        when: "People may need to create the entity they are picking first, such as an app connection or a gateway.",
        do: "Pass creation with mode dialog and a renderForm that reports dirty and pending and calls complete with the created option, and set disabledReason when the person may not create one.",
        avoid:
          "Send people to another page to create the entity, hide the Create row without the permission, or close the Dialog from the form without the discard guard.",
        reason:
          "Creating in place keeps the flow and its draft, and routing every close through one guard means a dirty form is never lost by accident.",
        evidence: [
          "src/components/v4/ui/combobox.tsx",
          "src/pages/design-system/examples/app-connection-form/default.tsx"
        ],
        detect: {
          by: "test",
          test: "src/components/v4/ui/combobox.test.tsx",
          how: "Opens the dialog row, edits the form and cancels: the discard prompt opens and Keep editing keeps the Dialog. Submitting calls complete, which selects the new option on the trigger and closes the Dialog."
        }
      },
      {
        id: "combobox-searchable-value",
        when: "A field searches an in-memory set or offers host-backed creation.",
        do: "Use stable option values, keep the visible field purpose separate from the query and pass onCreate only for a real cancellable host operation.",
        avoid:
          "Treat an empty search as an empty collection, create duplicate values, imply in-memory search is remote or filter again on top of onSearch results.",
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
      command: "npm run dev; open /design-system#combobox and exercise the documented interaction."
    }
  ]
} satisfies ComponentDefinition;
