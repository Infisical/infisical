import * as UI from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";

import { ExampleStack } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleStack>
      <UI.FieldGroup>
        <UI.Field label="Connection name" description="Shown in activity logs.">
          <Input defaultValue="Production vault" />
        </UI.Field>
        <UI.Field label="Service account" error="Choose an account with read access.">
          <Input defaultValue="" />
        </UI.Field>
        <UI.Field>
          <UI.FieldLabel htmlFor="field-project">Project name</UI.FieldLabel>
          <Input id="field-project" defaultValue="payments" />
          <UI.FieldDescription>Use a name your team recognizes.</UI.FieldDescription>
        </UI.Field>
      </UI.FieldGroup>
    </ExampleStack>
  );
}
