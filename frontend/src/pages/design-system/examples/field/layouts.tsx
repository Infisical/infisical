import { Field, FieldGroup } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";

import { ExampleCell } from "../../example-presentation";

export default function Example() {
  return (
    <FieldGroup>
      {(["vertical", "horizontal"] as const).map((orientation) => (
        <ExampleCell key={orientation} label={orientation}>
          <Field orientation={orientation} label="Name">
            <Input aria-label={`${orientation} name`} defaultValue="staging" />
          </Field>
        </ExampleCell>
      ))}
    </FieldGroup>
  );
}
