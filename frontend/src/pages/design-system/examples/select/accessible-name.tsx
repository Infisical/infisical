import { Select } from "@app/components/v4/ui/select";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

const options = [
  { value: "dev", label: "Development" },
  { value: "staging", label: "Staging" },
  { value: "prod", label: "Production" }
];
export default function Example() {
  return (
    <ExampleGrid width="field">
      <ExampleCell label="aria-label, no visible label">
        <Select options={options} defaultValue="staging" aria-label="Environment" />
      </ExampleCell>
      <ExampleCell label="aria-labelledby a visible heading">
        <div className="flex flex-col gap-2">
          <span id="select-name-heading">Compare against</span>
          <Select
            options={options}
            placeholder="Choose an environment"
            aria-labelledby="select-name-heading"
          />
        </div>
      </ExampleCell>
    </ExampleGrid>
  );
}
