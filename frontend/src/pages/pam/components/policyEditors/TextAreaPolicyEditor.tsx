import { Field, FieldContent, FieldDescription, FieldLabel, TextArea } from "@app/components/v3";

import { PolicyEditorProps } from "./types";

export const TextAreaPolicyEditor = ({
  label,
  description,
  value,
  onChange
}: PolicyEditorProps) => {
  const text = typeof value === "string" ? value : "";
  const patternCount = text.split(/\r?\n/).filter((line) => line.trim().length > 0).length;

  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <FieldContent>
        <TextArea
          rows={5}
          placeholder="Enter one regex pattern per line"
          value={text}
          onChange={(e) => {
            const val = e.target.value;
            onChange(val.trim() ? val : null);
          }}
        />
        <FieldDescription>
          {description}
          {patternCount > 0 && (
            <span className="ml-2 text-xs opacity-60">
              ({patternCount} {patternCount === 1 ? "pattern" : "patterns"})
            </span>
          )}
        </FieldDescription>
      </FieldContent>
    </Field>
  );
};
