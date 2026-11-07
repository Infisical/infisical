import { useState } from "react";

import { FieldMapping, FieldMappingRow } from "@app/components/v4/patterns/field-mapping";
import { Badge } from "@app/components/v4/ui/badge";

import { ExampleCell } from "../../example-presentation";

const fields = [
  { key: "accessKeyId", source: "Access key ID", icon: "key", placeholder: "AWS_ACCESS_KEY_ID" },
  {
    key: "secretAccessKey",
    source: "Secret access key",
    icon: "lock",
    placeholder: "AWS_SECRET_ACCESS_KEY"
  }
] as const;

export default function Example() {
  const [values, setValues] = useState<Record<string, string>>({
    accessKeyId: "AWS_ACCESS_KEY_ID",
    secretAccessKey: ""
  });
  return (
    <ExampleCell label="sm, with a trailing Decoy badge and one missing value">
      <FieldMapping
        legend="Honey token secret names"
        sourceHeader="Source field"
        targetHeader="Value"
        size="sm"
      >
        {fields.map((field) => (
          <FieldMappingRow
            key={field.key}
            source={field.source}
            icon={field.icon}
            mono
            value={values[field.key]}
            placeholder={field.placeholder}
            autoComplete="off"
            spellCheck={false}
            trailing={<Badge tone="warn">Decoy</Badge>}
            error={values[field.key] ? undefined : "Enter a secret name."}
            onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
          />
        ))}
      </FieldMapping>
    </ExampleCell>
  );
}
