import { Field, FieldContent, FieldDescription, FieldLabel, TextArea } from "@app/components/v3";

import { PolicyEditorProps } from "./types";

const RE2_SYNTAX_URL = "https://github.com/google/re2/wiki/Syntax";
const DEFAULT_PLACEHOLDER = "rm\\s+-rf.*\npassword\\s*=\\s*\\S+\n\\b\\d{3}-\\d{2}-\\d{4}\\b";

export const PatternRuleEditor = ({ label, description, value, onChange }: PolicyEditorProps) => {
  const text = typeof value === "string" ? value : "";

  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <FieldContent>
        <TextArea
          rows={5}
          placeholder={DEFAULT_PLACEHOLDER}
          value={text}
          onChange={(e) => {
            const val = e.target.value;
            onChange(val.trim() ? val : null);
          }}
        />
        <FieldDescription>
          {description}{" "}
          <a href={RE2_SYNTAX_URL} target="_blank" rel="noopener noreferrer" className="underline">
            Syntax reference
          </a>
        </FieldDescription>
      </FieldContent>
    </Field>
  );
};
