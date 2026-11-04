import type { ComponentDefinition } from "./types";

export const fieldMappingDefinition = {
  id: "field-mapping",
  title: "Field mapping",
  group: "Patterns",
  summary: "Map each source field to the value or name it becomes, one aligned row per field.",
  sourceFiles: [
    "src/components/v4/patterns/field-mapping.tsx",
    "src/components/v4/patterns/field-mapping.module.css"
  ],
  exports: ["FieldMapping", "FieldMappingRow"],
  referenceNames: ["FieldMapping", "FieldMappingRow"],
  behavior: [
    "FieldMapping is a fieldset with a visually hidden legend and a three-column grid: a sentence case header row (sourceHeader, then targetHeader with an optional targetHint such as an InfoTip), then one FieldMappingRow per field. The grid keeps every source, arrow and input in one column track, so the columns align however long a source name is.",
    "Each FieldMappingRow is a soft source Badge at the row's control height (size control-sm, control-md or control-lg, from FieldMapping size), a muted arrow glyph centered on the same height, and an Input of the matching size. The Badge stretches to the source column with its label at the start, so every arrow lines up.",
    "FieldMappingRow takes every Input prop except size and invalid, so trailing, mono, placeholder, value, onChange and ref pass straight through. A trailing slot keeps the Input's nested slot: put the compact Badge (default md) there, not a control-height one. error renders a FieldError under the Input and marks it invalid.",
    "The Input's accessible name defaults to targetHeader for source (Secret name for Access key ID); pass aria-label to replace it."
  ],
  accessibility: [
    "The legend names the whole group. Each Input is named by its source and the target header, so a screen reader hears which field it maps without seeing the grid. The arrow is decorative and hidden."
  ],
  limitations: [
    "The target column is always an Input. A mapping whose target is a Select, or whose direction runs from a picked column to a fixed field, is not covered yet.",
    "The host owns values, validation and defaults; FieldMapping only lays the rows out."
  ],
  related: ["badge", "input", "field"],
  examples: [
    {
      id: "default",
      title: "Mapping rows with a trailing badge",
      module: "./examples/field-mapping/default.tsx",
      states: ["default", "invalid"]
    }
  ],
  coverage: [
    {
      axis: "size",
      expected: ["sm", "md", "lg"],
      shown: [{ value: "sm", exampleId: "default", label: "sm" }],
      omitted: [
        {
          value: "md",
          reason:
            "Same layout at the 36px control height; Badge sizes shows control-md beside a md Input."
        },
        {
          value: "lg",
          reason:
            "Same layout at the 40px control height; Badge sizes shows control-lg beside a lg Input."
        }
      ]
    }
  ],
  guidance: {
    use: [
      "Use FieldMapping wherever a form maps named source fields to secret names or values: rotation credentials, honey token keys, sync and import mappings."
    ],
    avoid: [
      "Build a page-local grid of a span chip, an arrow and an Input. FieldMapping replaces those layouts."
    ],
    decision:
      "Choose FieldMapping for two or more fixed source fields that each need a value. Use a single Field for one input, and DataList to show a mapping that cannot be edited.",
    rules: [
      {
        id: "field-mapping-control-height",
        when: "A source label sits in the same row as the Input it maps to.",
        do: "Let FieldMappingRow render the source as a control-height Badge that matches the Input size.",
        avoid: "A compact 20px Badge or a hand-sized span beside a 32px Input.",
        reason:
          "A badge that shares a row with regular-height controls takes the control height, so the row reads as one band and the arrow centers on both.",
        evidence: [
          "src/components/v4/patterns/field-mapping.tsx",
          "src/pages/design-system/examples/field-mapping/default.tsx"
        ],
        detect: {
          by: "review",
          how: "Measure a mapping row: the source Badge, the arrow cell and the Input share one height."
        }
      },
      {
        id: "field-mapping-sentence-case",
        when: "Writing the header row.",
        do: "Name both columns in sentence case for what they hold, such as Source field and Secret name.",
        avoid: "Title Case headers like Rotated Credentials, or an empty header over the inputs.",
        reason: "The headers are the only visible labels for the inputs.",
        evidence: ["src/pages/design-system/examples/field-mapping/default.tsx"],
        detect: {
          by: "review",
          how: "Read the header row for sentence case and a noun per column."
        }
      }
    ],
    states: [
      {
        state: "invalid",
        guidance: "The FieldError sits under its own Input; the source Badge and arrow stay put."
      }
    ],
    antiSlop: [
      {
        do: "Use a soft Badge with the field's own glyph for the source.",
        avoid: "Color each source by status or add a left accent bar to the row.",
        reason: "The source is a name, not a state."
      }
    ]
  },
  checks: [
    { kind: "static", command: "npm run type:check" },
    {
      kind: "browser",
      command: "npm run dev; open /design-system/patterns/field-mapping and compare row heights."
    }
  ]
} satisfies ComponentDefinition;
