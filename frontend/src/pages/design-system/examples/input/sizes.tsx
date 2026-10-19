import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleGrid aria-label="Input sizes" width="field">
      {(["sm", "md", "lg"] as const).map((size) => (
        <ExampleCell key={size} label={size}>
          <Field label={`${size} name`}>
            <Input size={size} defaultValue="staging" />
          </Field>
        </ExampleCell>
      ))}
    </ExampleGrid>
  );
}
