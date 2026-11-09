import { useState } from "react";

import { Field } from "@app/components/v4/ui/field";
import { MultiSelect, type MultiSelectOption } from "@app/components/v4/ui/multi-select";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

const options: MultiSelectOption[] = [
  { value: "dev", label: "Development", description: "138 secrets" },
  { value: "staging", label: "Staging", description: "96 secrets" },
  { value: "prod", label: "Production", description: "212 secrets" },
  { value: "pr-482", label: "pr-482", description: "Expires Oct 1", group: "Preview" },
  { value: "pr-490", label: "pr-490", description: "Expired", group: "Preview", disabled: true }
];
const many: MultiSelectOption[] = [
  "Development",
  "Staging",
  "Production",
  "QA",
  "Sandbox",
  "Demo",
  "Load test",
  "Canary",
  "EU production",
  "US production",
  "APAC production",
  "Disaster recovery"
].map((label) => ({ value: label.toLowerCase().replace(/\s+/g, "-"), label }));
export default function Example() {
  const [none, setNone] = useState<string[]>([]);
  const [twelve, setTwelve] = useState<string[]>([]);
  const [all, setAll] = useState(["dev", "staging", "prod", "pr-482"]);
  return (
    <ExampleGrid width="field">
      <ExampleCell label="None selected, Deselect all disabled">
        <Field label="Environments">
          <MultiSelect
            label="Environments"
            placeholder="Choose environments"
            options={options}
            value={none}
            onChange={setNone}
          />
        </Field>
      </ExampleCell>
      <ExampleCell label="All selected, Select all disabled">
        <Field label="Environments">
          <MultiSelect
            label="Environments"
            allLabel="All environments"
            options={options}
            value={all}
            onChange={setAll}
          />
        </Field>
      </ExampleCell>
      <ExampleCell label="Twelve environments, the list scrolls">
        <Field label="Environments">
          <MultiSelect
            label="Environments"
            placeholder="Choose environments"
            options={many}
            value={twelve}
            onChange={setTwelve}
          />
        </Field>
      </ExampleCell>
    </ExampleGrid>
  );
}
