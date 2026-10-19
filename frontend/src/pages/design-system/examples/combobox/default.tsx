import { useState } from "react";

import { Combobox } from "@app/components/v4/ui/combobox";
import { Field } from "@app/components/v4/ui/field";

import { ExampleStack } from "../../example-presentation";

export default function Example() {
  const [value, setValue] = useState("dev");
  return (
    <ExampleStack>
      <Field
        label="Single environment"
        description="Choose an existing environment. Creation is unavailable."
      >
        <Combobox
          label="Single environment"
          options={[
            { value: "dev", label: "Dev", meta: "3 projects" },
            { value: "prod", label: "Prod", meta: "12 projects" },
            { value: "archived", label: "Archived", disabled: true }
          ]}
          value={value}
          onChange={setValue}
          placeholder="Choose"
        />
      </Field>
      <p role="status" className="sr-only text-sm">
        Selected environment: {value || "none"}
      </p>
    </ExampleStack>
  );
}
