import { Field } from "@app/components/v4/ui/field";
import { Select } from "@app/components/v4/ui/select";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  const options = [
    { value: "west", label: "West", description: "2 projects" },
    {
      value: "long",
      label: "Long resource identifier",
      description: "environment_very_long_identifier_01234567890123456789"
    }
  ];
  return (
    <ExampleGrid width="field">
      <ExampleCell label="Long metadata, wide menu">
        <Field label="Region">
          <Select
            options={options}
            defaultValue="west"
            menuWidth="min(20rem, calc(100vw - 2rem))"
          />
        </Field>
      </ExampleCell>
    </ExampleGrid>
  );
}
