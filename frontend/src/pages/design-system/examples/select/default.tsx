import { useState } from "react";

import { Field } from "@app/components/v4/ui/field";
import { Select, type SelectOption } from "@app/components/v4/ui/select";

import { ExampleStack } from "../../example-presentation";

const options: SelectOption[] = [
  { value: "dev", label: "Dev", description: "3 projects", group: "Active" },
  { value: "prod", label: "Prod", description: "12 projects", group: "Active" },
  { value: "archived", label: "Archived", disabled: true, group: "Unavailable" }
];
export default function Example() {
  const [value, setValue] = useState("dev");
  return (
    <ExampleStack>
      <Field label="Environment">
        <Select options={options} value={value} onChange={setValue} />
      </Field>
      <p role="status" className="sr-only text-sm">
        Current environment: {value}
      </p>
    </ExampleStack>
  );
}
