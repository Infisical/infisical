import { useState } from "react";

import { Combobox } from "@app/components/v4/ui/combobox";
import { Field } from "@app/components/v4/ui/field";

import { ExampleStack } from "../../example-presentation";

export default function Example() {
  const [values, setValues] = useState(["dev", "audit"]);
  return (
    <ExampleStack>
      <Field
        label="Visible environments"
        description="Audit is required by policy. Creation is unavailable."
      >
        <Combobox
          label="Visible environments"
          multiple
          options={[
            { value: "dev", label: "Dev" },
            { value: "prod", label: "Prod" },
            { value: "audit", label: "Audit", disabled: true }
          ]}
          value={values}
          onChange={setValues}
          placeholder="Choose"
        />
      </Field>
      <p role="status" className="sr-only text-sm">
        Selected environments: {values.join(", ") || "none"}
      </p>
    </ExampleStack>
  );
}
