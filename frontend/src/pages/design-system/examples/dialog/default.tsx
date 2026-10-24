import { useId, useState } from "react";

import { Button } from "@app/components/v4/ui/button";
import * as UI from "@app/components/v4/ui/dialog";
import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";

import { ExampleCell } from "../../example-presentation";

export default function Example() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("staging");
  const formId = useId();
  return (
    <ExampleCell label="Editable form">
      <UI.Dialog open={open} onOpenChange={setOpen}>
        <UI.DialogTrigger asChild>
          <Button variant="outline">Edit environment</Button>
        </UI.DialogTrigger>
        <UI.DialogContent>
          <UI.DialogHeader>
            <UI.DialogTitle>Edit environment</UI.DialogTitle>
            <UI.DialogDescription>Choose the name used in navigation.</UI.DialogDescription>
          </UI.DialogHeader>
          <form
            id={formId}
            onSubmit={(event) => {
              event.preventDefault();
              setOpen(false);
            }}
          >
            <Field label="Environment name">
              <Input required value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
          </form>
          <UI.DialogFooter>
            <UI.DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </UI.DialogClose>
            <Button type="submit" form={formId}>
              Save changes
            </Button>
          </UI.DialogFooter>
        </UI.DialogContent>
      </UI.Dialog>
    </ExampleCell>
  );
}
