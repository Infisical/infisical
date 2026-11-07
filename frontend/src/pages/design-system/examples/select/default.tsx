import { useState } from "react";

import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import { Select, type SelectOption } from "@app/components/v4/ui/select";

import { ExampleStack } from "../../example-presentation";

const options: SelectOption[] = [
  { value: "dev", label: "Development", description: "138 secrets", group: "Active" },
  { value: "staging", label: "Staging", description: "96 secrets", group: "Active" },
  { value: "prod", label: "Production", description: "212 secrets", group: "Active" },
  { value: "pr-482", label: "pr-482", description: "Expires Oct 1", group: "Preview" },
  { value: "pr-490", label: "pr-490", description: "Expired", disabled: true, group: "Preview" }
];
export default function Example() {
  const [value, setValue] = useState("dev");
  return (
    <ExampleStack>
      <Field label="Secret name">
        <Input defaultValue="DATABASE_URL" />
      </Field>
      <Field label="Environment">
        <Select options={options} value={value} onChange={setValue} />
      </Field>
      <p role="status" className="sr-only text-sm">
        Current environment: {value}
      </p>
    </ExampleStack>
  );
}
