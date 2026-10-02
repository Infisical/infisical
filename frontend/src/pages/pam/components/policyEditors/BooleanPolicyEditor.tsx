import { Field, FieldContent, FieldDescription, FieldTitle, Toggle } from "@app/components/v3";

import { PolicyEditorProps } from "./types";

export const BooleanPolicyEditor = ({ label, description, value, onChange }: PolicyEditorProps) => (
  <Field orientation="horizontal" className="items-center!">
    <FieldContent>
      <FieldTitle>{label}</FieldTitle>
      <FieldDescription>{description}</FieldDescription>
    </FieldContent>
    <Toggle
      checked={value === true}
      variant="pam"
      onCheckedChange={(checked) => onChange(checked)}
    />
  </Field>
);
