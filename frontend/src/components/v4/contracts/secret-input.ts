import type { ComponentDefinition } from "./types";

export const secretInputDefinition = {
  id: "secret-input",
  title: "Secret input",
  group: "Forms",
  summary: "Type or paste a secret value that stays masked until the field is focused.",
  sourceFiles: [
    "src/components/v4/ui/secret-input.tsx",
    "src/components/v4/ui/secret-input.module.css",
    "src/components/v4/lib/invisible-characters.ts"
  ],
  exports: ["SecretInput", "SecretInputProps", "HIDDEN_SECRET_VALUE"],
  referenceNames: ["SecretInput", "InfisicalSecretInput"],
  behavior: [
    "Controlled: value and onChange(value: string) own the text. While the textarea is not focused and the value is not empty it shows HIDDEN_SECRET_VALUE, the same 16-dot mask as v3; focus binds the real value for editing, selection and copy, and blur masks it again. The mask is never passed to onChange.",
    "It is a textarea, so pasted line breaks are kept. One-line by default at the 32px control height and grows with content up to seven lines, then scrolls. multiline starts it at three lines for certificates and JSON.",
    "When the value holds invisible characters (control, format, Unicode space, line and paragraph separators, found by Unicode category and ignoring emoji joiner sequences), a warning action sits in the trailing slot. Its tooltip lists each character type, count and code point without revealing the value, and it stays visible while the value is masked.",
    "Field wiring (id, aria-describedby, aria-invalid) comes from the surrounding Field. Without a label it falls back to the accessible name Secret value. invalid draws the invalid border."
  ],
  accessibility: [
    "Label it with Field or aria-label. The invisible character warning is named and linked to the textarea through aria-describedby, so screen readers hear it with the field.",
    "Masking is visual; a screen reader hears the mask until focus, then the value it is editing."
  ],
  limitations: [
    "This is the editable field, matching v3 SecretInput. The read-only reveal and copy display that was called SecretInput in v4 is now SecretValue on the Sensitive editor page.",
    "Secret reference highlighting, the reference picker and Cmd-click navigation from v3 InfisicalSecretInput are not part of it; those belong to a later InfisicalSecretInput.",
    "No always-visible mode, per-character mask or edit-without-view selection yet. Characters are listed in the warning tooltip, not marked inline.",
    "Masking does not protect the value: the host already holds plaintext. Use SensitiveEditor when a stored value must not be fetched until an explicit reveal."
  ],
  related: ["sensitive-editor", "textarea", "input"],
  examples: [
    {
      id: "default",
      title: "Masked editing",
      module: "./examples/secret-input/default.tsx",
      states: ["default", "controlled", "empty", "editing"]
    }
  ],
  coverage: [
    {
      axis: "state",
      expected: ["masked", "focused", "empty", "multiline", "invisible-characters"],
      shown: [
        { value: "masked", exampleId: "default", label: "Masked until focused" },
        { value: "empty", exampleId: "default", label: "Empty, with placeholder" },
        { value: "multiline", exampleId: "default", label: "Multiline" },
        {
          value: "invisible-characters",
          exampleId: "default",
          label: "Invisible characters warning"
        }
      ],
      omitted: [
        {
          value: "focused",
          reason: "Focus any field on the page to see the real value replace the mask."
        }
      ]
    }
  ],
  guidance: {
    use: [
      "Bind value and onChange to the form state and let focus reveal the value for editing. Keep the warning visible so pasted invisible characters are caught before save."
    ],
    avoid: [
      "Use the read-only SecretValue for an editable field or feed HIDDEN_SECRET_VALUE back into form state."
    ],
    decision:
      "Choose SecretInput to type or paste a secret value in a form. Use SecretValue to show a value the host already holds with reveal and copy, and SensitiveEditor when the stored value must be fetched only on explicit reveal.",
    rules: [
      {
        id: "secret-input-masked-editing",
        when: "A form collects a new secret value or edits one the person may view.",
        do: "Pass the real value and onChange; the field masks itself while unfocused and edits the real text when focused.",
        avoid:
          "Store HIDDEN_SECRET_VALUE in form state or port a v3 SecretInput to SecretValue, which cannot be edited.",
        reason:
          "The mask is display only, so saving it would overwrite the secret with dots, and the old v4 name pointed at a read-only display.",
        evidence: [
          "src/components/v4/ui/secret-input.tsx",
          "src/pages/design-system/examples/secret-input/default.tsx"
        ],
        detect: {
          by: "test",
          test: "src/components/v4/ui/migration-traps.test.tsx",
          how: "Renders a value with a zero-width space, checks the textarea shows the mask and the warning, then focuses it and checks the real value."
        }
      }
    ],
    states: [
      {
        state: "masked",
        guidance: "Blur always masks a non-empty value; the warning stays visible."
      },
      {
        state: "invalid",
        guidance: "Pass invalid or let Field mark it, and keep the error message beside the field."
      }
    ],
    antiSlop: [
      {
        do: "Explain the invisible characters by type and code point in the warning.",
        avoid: "Strip the characters silently or reveal the value in the tooltip.",
        reason:
          "A pasted no-break space or zero-width space breaks the secret where it is used, and the person decides whether it belongs."
      }
    ]
  },
  checks: [
    {
      kind: "runtime",
      command: "npx vitest run src/components/v4/ui/migration-traps.test.tsx"
    },
    { kind: "static", command: "npm run type:check" },
    {
      kind: "browser",
      command:
        "Open /design-system#secret-input, focus and blur each field in both themes and hover the warning."
    }
  ]
} satisfies ComponentDefinition;
