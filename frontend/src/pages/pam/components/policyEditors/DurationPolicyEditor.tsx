import { Field, FieldContent, FieldDescription, FieldLabel, Input } from "@app/components/v3";

import { PolicyEditorProps } from "./types";

export const DurationPolicyEditor = ({
  label,
  description,
  value,
  onChange
}: PolicyEditorProps) => (
  <Field>
    <FieldLabel>{label}</FieldLabel>
    <FieldContent>
      <Input
        type="number"
        placeholder="e.g. 3600 (defaults to 1 hour if empty)"
        value={typeof value === "number" ? value : ""}
        onChange={(e) => {
          const parsed = Number(e.target.value);
          onChange(e.target.value === "" || Number.isNaN(parsed) ? null : parsed);
        }}
        onWheel={(e) => e.currentTarget.blur()}
      />
      <FieldDescription>{description}</FieldDescription>
    </FieldContent>
  </Field>
);
