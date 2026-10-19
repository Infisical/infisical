import { useState } from "react";

import { Combobox, type ComboboxOption } from "@app/components/v4/ui/combobox";
import { Field } from "@app/components/v4/ui/field";

import { ExampleCell } from "../../example-presentation";

export default function Example() {
  const [options, setOptions] = useState<ComboboxOption[]>([
    { value: "dev", label: "Dev" },
    { value: "prod", label: "Prod" },
    { value: "archived", label: "Archived", disabled: true }
  ]);
  const [value, setValue] = useState("dev");
  return (
    <ExampleCell label="Search and create">
      <Field label="Environment">
        <Combobox
          label="Environment"
          options={options}
          value={value}
          onChange={setValue}
          onCreate={async (query, { signal }) => {
            await new Promise((resolve) => {
              setTimeout(resolve, 300);
            });
            if (signal.aborted) return;
            setOptions((previous) => [...previous, { value: query, label: query }]);
            setValue(query);
          }}
        />
      </Field>
    </ExampleCell>
  );
}
