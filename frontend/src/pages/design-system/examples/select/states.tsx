import { Field } from "@app/components/v4/ui/field";
import { Select } from "@app/components/v4/ui/select";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

const options = [
  { value: "dev", label: "Development" },
  { value: "prod", label: "Production" }
];
export default function Example() {
  return (
    <ExampleGrid width="field">
      <ExampleCell label="Placeholder">
        <Field label="Environment">
          <Select options={options} placeholder="Choose an environment" />
        </Field>
      </ExampleCell>
      <ExampleCell label="Disabled">
        <Field label="Environment">
          <Select options={options} defaultValue="prod" disabled />
        </Field>
      </ExampleCell>
      <ExampleCell label="Invalid">
        <Field label="Environment" error="Choose an environment.">
          <Select options={options} placeholder="Choose an environment" />
        </Field>
      </ExampleCell>
    </ExampleGrid>
  );
}
