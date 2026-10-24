import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleGrid>
      <ExampleCell label="Empty">
        <Field label="Environment name">
          <Input />
        </Field>
      </ExampleCell>
      <ExampleCell label="Read-only">
        <Field label="Managed account" description="Set by the connected provider.">
          <Input readOnly value="deploy-production" />
        </Field>
      </ExampleCell>
      <ExampleCell label="Disabled">
        <Field label="Environment name">
          <Input disabled defaultValue="Inherited from policy" />
        </Field>
      </ExampleCell>
      <ExampleCell label="Invalid">
        <Field label="Environment slug" error="Use letters, numbers and hyphens.">
          <Input invalid defaultValue="production /" />
        </Field>
      </ExampleCell>
    </ExampleGrid>
  );
}
