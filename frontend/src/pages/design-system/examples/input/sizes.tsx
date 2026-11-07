import { Button } from "@app/components/v4/ui/button";
import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleGrid aria-label="Input sizes" width="field">
      <ExampleCell label="xs">
        <div className="flex items-center gap-2">
          <Input size="xs" icon="search" placeholder="Search members" aria-label="Search members" />
          <Button variant="outline" size="xs">
            Export
          </Button>
          <Button variant="outline" size="xs" icon="plus">
            Invite
          </Button>
        </div>
      </ExampleCell>
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
