import type { ComponentDefinition } from "./types";

export const multiSelectDefinition = {
  id: "multi-select",
  title: "Multi-select",
  group: "Forms",
  summary: "Choose several known options without closing after each selection.",
  sourceFiles: [
    "src/components/v4/ui/multi-select.tsx",
    "src/components/v4/ui/picker.module.css",
    "src/components/v4/lib/use-option-creation.ts"
  ],
  exports: ["MultiSelect"],
  referenceNames: ["MultiSelect"],
  behavior: [
    "Multiple and single selection; controlled or local value and open state. Multiple callbacks follow the options order; duplicate option values are rejected at the public boundary.",
    "Default triggers are ordinary fields: the visible purpose comes from a Field label, size defaults to sm32 and explicit md is 36px. label names the trigger for assistive technology and is not drawn inside it. Multiple summaries show the first label and a remaining count, or a caller-supplied allLabel when every enabled option is selected.",
    "Grouping, and a search row that appears only when searchable is set (it is off by default). Selection happens on the options: uncheck an option to deselect it, there is no Clear action. Ctrl or Cmd+A toggles every enabled option and preserves disabled selections. Choosing the current option in single mode keeps it and closes the list.",
    "Creation receives a host AbortSignal; changing the query, closing or unmounting aborts and invalidates the prior request.",
    "A host DOMException named AbortError is cancellation. It preserves the query without failure feedback; other failures remain retryable."
  ],
  accessibility: [
    "The option list announces which options are selected, arrow keys move through it, and pressing Enter while composing text with an input method never selects an option.",
    "Selection count is announced; Mod+A toggles enabled options while preserving disabled selections."
  ],
  limitations: [
    "Use application state for persisted permissions; selection is not an authorization decision.",
    "Creation persistence belongs to the host. Aborting suppresses obsolete UI results and asks the host to cancel; it cannot undo an already committed server write."
  ],
  examples: [
    {
      id: "default",
      title: "Permission draft",
      module: "./examples/multi-select/default.tsx",
      states: ["controlled", "keyboard"]
    },
    {
      id: "sizes",
      title: "Sizes",
      module: "./examples/multi-select/sizes.tsx",
      states: ["default"]
    }
  ],
  coverage: [
    {
      axis: "size",
      expected: ["sm", "md"],
      shown: [
        {
          value: "sm",
          exampleId: "sizes",
          label: "sm"
        },
        {
          value: "md",
          exampleId: "sizes",
          label: "md"
        }
      ]
    },
    {
      axis: "mode",
      expected: ["multiple", "single"],
      shown: [
        {
          value: "multiple",
          exampleId: "default",
          label: "Project roles"
        },
        {
          value: "single",
          exampleId: "default",
          label: "One permission"
        }
      ]
    },
    {
      axis: "side",
      expected: ["top", "right", "bottom", "left"],
      shown: [],
      omitted: [
        {
          value: "top",
          reason:
            "Side places the open panel against the trigger, so it only shows while open. bottom is the default and the panel flips when it does not fit."
        },
        { value: "right", reason: "Set side on MultiSelect; the closed trigger looks the same." },
        { value: "bottom", reason: "The default side, shown by every open panel." },
        { value: "left", reason: "Set side on MultiSelect; the closed trigger looks the same." }
      ]
    },
    {
      axis: "align",
      expected: ["start", "center", "end"],
      shown: [],
      omitted: [
        { value: "start", reason: "The default alignment, shown by every open panel." },
        { value: "center", reason: "Set align on MultiSelect; the closed trigger looks the same." },
        { value: "end", reason: "Set align on MultiSelect; the closed trigger looks the same." }
      ]
    },
    {
      axis: "search",
      expected: ["hidden", "searchable"],
      shown: [
        {
          value: "hidden",
          exampleId: "default",
          label: "One permission"
        }
      ],
      omitted: [
        {
          value: "searchable",
          reason: "Set searchable only for long option lists; the closed trigger looks the same."
        }
      ]
    },
    {
      axis: "state",
      expected: [
        "disabled selected",
        "invalid",
        "disabled",
        "empty options",
        "pending creation",
        "failed creation and retry",
        "AbortError cancellation",
        "controlled open"
      ],
      shown: [
        {
          value: "disabled selected",
          exampleId: "default",
          label: "Admin is required by policy."
        }
      ],
      omitted: [
        {
          value: "invalid",
          reason:
            "Invalid and disabled use the shared field surface, which the Input and Field examples show once."
        },
        {
          value: "disabled",
          reason:
            "Invalid and disabled use the shared field surface, which the Input and Field examples show once."
        },
        {
          value: "empty options",
          reason:
            "An empty list shows the same No options found row the search shows; selection-disclosure tests cover it."
        },
        {
          value: "pending creation",
          reason:
            "Creation needs a search field and is shown on Combobox, which uses the same creation hook."
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
        },
        {
          value: "controlled open",
          reason:
            "Controlled open state is covered in menu-recipes tests; the example shows the default closed trigger."
        }
      ]
    },
    {
      axis: "composition",
      expected: ["option ordering", "custom trigger", "custom summary"],
      shown: [
        {
          value: "option ordering",
          exampleId: "default",
          label: "Selected roles:"
        }
      ],
      omitted: [
        {
          value: "custom trigger",
          reason:
            "The trigger prop is covered by selection-disclosure tests; the examples keep to the standard field."
        },
        {
          value: "custom summary",
          reason:
            "renderValue is covered by selection-disclosure tests; the examples keep to the standard field."
        }
      ]
    }
  ],
  guidance: {
    use: [
      "Put the trigger in a Field and use sm or md. Multiple mode returns option ids; single mode returns one id or null."
    ],
    avoid: [],
    decision:
      "Choose MultiSelect for several known values from a searchable list. Use Checkbox for a few visible independent choices and Combobox for one value.",
    rules: [
      {
        id: "multi-select-usage",
        when: "A selection grants access only after a host operation succeeds.",
        do: "Keep selected option ids as draft state and let the host authorize and persist the result.",
        avoid:
          "Treat the checked UI as proof of permission or erase the draft after a rejected save.",
        reason: "Selection is an input to authorization, not the authorization decision.",
        evidence: [
          "src/components/v4/ui/multi-select.tsx",
          "src/pages/design-system/examples/multi-select/default.tsx"
        ],
        detect: {
          by: "review",
          how: "Search, select-all and uncheck while a disabled option is already selected. Eligible changes preserve protected choices and the resulting draft does not itself grant permission."
        }
      },
      {
        id: "multi-select-selection-and-summary",
        when: "Several known values include disabled selections or host-created options.",
        do: "Use sm or md, preserve disabled selections and deselect by unchecking.",
        avoid:
          "Infer granted permissions from chips, rewrite protected values through select-all or show allLabel when enabled options are not all selected.",
        reason:
          "The summary represents supplied choices; it cannot authorize access or rewrite disabled policy values.",
        detect: {
          by: "review",
          how: "Select every option with Ctrl or Cmd+A, uncheck each option, change search during creation and choose a single value. Disabled selections survive, callbacks preserve option ordering and stale creation does not alter selection."
        },
        evidence: [
          "src/components/v4/ui/multi-select.tsx",
          "src/pages/design-system/examples/multi-select/default.tsx"
        ]
      }
    ],
    states: [
      {
        state: "empty",
        guidance: "Explain what may be selected without inventing an initial grant."
      },
      {
        state: "overflow",
        guidance:
          "Keep the selected count and a way to review selected options when chips no longer fit."
      }
    ],
    antiSlop: [
      {
        do: "Use labels that distinguish each selectable resource.",
        avoid:
          "Render dozens of full-width chips before the input and hide the search field below them.",
        reason: "Selected-value display must leave room to continue selecting."
      },
      {
        do: "Show empty, protected and long-value cases, and keep creation and permission results owned by the host.",
        avoid:
          "Treat a checked draft as authorization or drop policy-required choices through a quick action.",
        reason:
          "The input gathers values; it cannot grant permission or certify that persistence succeeded."
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
      command:
        "npm test -- src/components/v4/ui/foundation-controls.test.tsx src/components/v4/ui/selection-disclosure.test.tsx"
    },
    {
      kind: "browser",
      command:
        "npm run ui:dev; open /design-system#multi-select and exercise the documented interaction."
    }
  ]
} satisfies ComponentDefinition;
