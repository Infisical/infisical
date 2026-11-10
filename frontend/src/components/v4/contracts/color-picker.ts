import type { ComponentDefinition } from "./types";

export const colorPickerDefinition = {
  id: "color-picker",
  title: "Color picker",
  group: "Forms",
  summary: "A hex color field with a swatch that opens a palette of preset colors.",
  sourceFiles: [
    "src/components/v4/ui/color-picker.tsx",
    "src/components/v4/ui/color-picker.module.css"
  ],
  exports: ["ColorPicker", "tagColorPresets"],
  referenceNames: ["ColorPicker"],
  behavior: [
    "value is the hex text as typed and onChange receives every edit and every preset pick, so the caller validates it the same way it validates any field. The swatch shows the value only when it is a six-digit hex color and is hatched otherwise.",
    "presets is a list of { name, value }. With presets, the swatch is a button that opens a popover palette; without them the swatch is a plain preview. tagColorPresets is the palette main offers for secret tags.",
    "Picking a preset with the pointer sets the value and closes the palette. Arrow keys move through the palette and select as they go, Space selects, and Escape closes it and returns focus to the swatch.",
    "The field takes every Input prop except mono, icon, kbd and trailing: the value is always mono and the trailing slot holds the swatch. disabled or readOnly also disables the swatch button."
  ],
  accessibility: [
    "The palette is a Radix radio group named Preset colors with one tab stop; each swatch's accessible name is its preset name, so a screen reader never hears only a hex value.",
    "The swatch button is named Preset colors and adds the selected preset's name when the value matches one.",
    "Label the field with Field, which links the label and error to the input."
  ],
  limitations: [
    "There is no free-form picker surface (hue and saturation). Colors outside the presets are typed as hex.",
    "Only six-digit hex values preview. Three-digit and eight-digit forms are left for the caller's validation to reject."
  ],
  related: ["input", "field", "popover", "radio-group"],
  examples: [
    {
      id: "default",
      title: "Tag colors, custom value and states",
      module: "./examples/color-picker/default.tsx",
      states: ["default", "empty", "invalid", "disabled", "keyboard"]
    }
  ],
  coverage: [
    {
      axis: "presets",
      expected: ["with presets", "without presets"],
      shown: [
        { value: "with presets", exampleId: "default", label: "Tag color" },
        { value: "without presets", exampleId: "default", label: "No presets, preview only" }
      ]
    }
  ],
  guidance: {
    use: [
      "Use ColorPicker for a stored color a person picks, such as a tag color or a brand color."
    ],
    avoid: ["Do not pair an Input with a hand-built swatch or a native color input."],
    decision:
      "Choose ColorPicker when the stored value is a hex color. Use Select or RadioGroup when the choice is a named option whose color is only decoration.",
    rules: [
      {
        id: "color-picker-named-presets",
        when: "A surface offers preset colors.",
        do: "Pass presets with a human name for each color, such as tagColorPresets.",
        avoid: "Pass bare hex values or label swatches with their hex.",
        reason:
          "The name is each swatch's accessible name, so a palette of hex values reads as noise.",
        evidence: [
          "src/components/v4/ui/color-picker.tsx",
          "src/pages/design-system/examples/color-picker/default.tsx"
        ],
        detect: {
          by: "review",
          how: "Every presets entry has a name that is a word, not a hex value."
        }
      }
    ],
    states: [
      {
        state: "empty",
        guidance: "The swatch is hatched and the placeholder shows the hex format."
      },
      {
        state: "invalid",
        guidance:
          "Pass invalid with the Field error; the swatch stays hatched until the value parses."
      },
      { state: "disabled", guidance: "The field and the swatch button are both disabled." }
    ],
    antiSlop: [
      {
        do: "Keep one palette per kind of value, so the same tag color looks the same everywhere.",
        avoid: "Invent a new palette for each screen.",
        reason: "Colors a person chose on one page must match on every other page that shows them."
      }
    ]
  },
  checks: [
    { kind: "static", command: "npm run type:check" },
    {
      kind: "browser",
      command:
        "In both schemes, open the palette with the pointer and the keyboard, arrow through it, pick a preset and check the field value and swatch."
    }
  ]
} satisfies ComponentDefinition;
