import { Field } from "@app/components/v4/ui/field";
import { Select } from "@app/components/v4/ui/select";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleGrid width="field">
      {(["default", "md", "lg"] as const).map((size) => (
        <ExampleCell key={size} label={size === "default" ? "default, sm" : size}>
          <Field label={`${size} region`}>
            <Select
              size={size}
              options={[
                { value: "west", label: "West" },
                { value: "east", label: "East" }
              ]}
              defaultValue="west"
            />
          </Field>
        </ExampleCell>
      ))}
    </ExampleGrid>
  );
}
