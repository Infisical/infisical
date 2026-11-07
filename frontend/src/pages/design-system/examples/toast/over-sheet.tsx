import { useState } from "react";

import { Button } from "@app/components/v4/ui/button";
import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import * as UI from "@app/components/v4/ui/sheet";
import { toast } from "@app/components/v4/ui/sonner";

import { ExampleCell } from "../../example-presentation";

export default function Example() {
  const [saved, setSaved] = useState("30");
  const [draft, setDraft] = useState(saved);
  return (
    <ExampleCell label={`Saved interval: ${saved} days`}>
      <UI.Sheet>
        <UI.SheetTrigger asChild>
          <Button variant="outline">Edit rotation</Button>
        </UI.SheetTrigger>
        <UI.SheetContent>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setSaved(draft);
              toast.success("Rotation schedule saved", {
                description: `DATABASE_URL now rotates every ${draft} days.`
              });
            }}
          >
            <UI.SheetHeader>
              <UI.SheetTitle>Rotation schedule</UI.SheetTitle>
              <UI.SheetDescription>The sheet stays open after saving.</UI.SheetDescription>
            </UI.SheetHeader>
            <UI.SheetBody>
              <Field label="Interval in days">
                <Input
                  required
                  inputMode="numeric"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                />
              </Field>
            </UI.SheetBody>
            <UI.SheetFooter>
              <Button type="submit" disabled={draft === saved}>
                Save schedule
              </Button>
            </UI.SheetFooter>
          </form>
        </UI.SheetContent>
      </UI.Sheet>
    </ExampleCell>
  );
}
