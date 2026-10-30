import { MultiSelect } from "@app/components/v4/ui/multi-select";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleGrid width="field">
      {(["sm", "md"] as const).map((size) => (
        <ExampleCell key={size} label={size}>
          <MultiSelect
            size={size}
            label="Role"
            options={[
              { value: "read", label: "Read" },
              { value: "write", label: "Write" }
            ]}
            defaultValue={["read"]}
          />
        </ExampleCell>
      ))}
    </ExampleGrid>
  );
}
