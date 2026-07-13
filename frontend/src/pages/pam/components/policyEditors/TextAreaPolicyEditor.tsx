import { Field, FieldContent, FieldDescription, FieldLabel, TextArea } from "@app/components/v3";

import { PolicyEditorProps } from "./types";

export const TextAreaPolicyEditor = ({
  label,
  description,
  value,
  onChange,
  placeholder
}: PolicyEditorProps & { placeholder?: string }) => {
  const text = typeof value === "string" ? value : "";

  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <FieldContent>
        <TextArea
          rows={5}
          placeholder={placeholder}
          value={text}
          onChange={(e) => {
            const val = e.target.value;
            onChange(val.trim() ? val : null);
          }}
        />
        <FieldDescription>{description}</FieldDescription>
      </FieldContent>
    </Field>
  );
};
