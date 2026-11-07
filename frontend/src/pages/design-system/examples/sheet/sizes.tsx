import { Button } from "@app/components/v4/ui/button";
import { Field, FieldGroup } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import * as UI from "@app/components/v4/ui/sheet";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

const sizes = ["sm", "md", "lg"] as const;

export default function Example() {
  return (
    <ExampleGrid width="compact">
      {sizes.map((size) => (
        <ExampleCell key={size} label={size}>
          <UI.Sheet>
            <UI.SheetTrigger asChild>
              <Button variant="outline">{size} sheet</Button>
            </UI.SheetTrigger>
            <UI.SheetContent size={size}>
              <UI.SheetHeader>
                <UI.SheetTitle>Staging connection</UI.SheetTitle>
                <UI.SheetDescription>
                  Edit the name and access key for this connection.
                </UI.SheetDescription>
              </UI.SheetHeader>
              <UI.SheetBody>
                <FieldGroup>
                  <Field label="Connection name" wide>
                    <Input defaultValue="aws-staging-keys" />
                  </Field>
                  <Field label="Access key ID" description="Shown in activity logs." wide>
                    <Input defaultValue="AKIAEXAMPLESTAGING01" />
                  </Field>
                </FieldGroup>
              </UI.SheetBody>
              <UI.SheetFooter>
                <UI.SheetClose asChild>
                  <Button variant="outline">Close connection</Button>
                </UI.SheetClose>
              </UI.SheetFooter>
            </UI.SheetContent>
          </UI.Sheet>
        </ExampleCell>
      ))}
    </ExampleGrid>
  );
}
