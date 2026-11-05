import { useState } from "react";

import { Button } from "@app/components/v4/ui/button";
import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import { Stack } from "@app/components/v4/ui/layout";
import * as UI from "@app/components/v4/ui/sheet";

import { ExampleCell } from "../../example-presentation";

const scopes = [
  "secrets:read",
  "secrets:write",
  "folders:read",
  "folders:write",
  "imports:read",
  "imports:write",
  "dynamic-secrets:lease",
  "integrations:read",
  "integrations:sync",
  "audit-logs:read",
  "certificates:read",
  "certificates:issue"
];

export default function Example() {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState("ci-deployer");
  const [draft, setDraft] = useState(saved);
  return (
    <ExampleCell label={`Saved name: ${saved}`}>
      <UI.Sheet
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) setDraft(saved);
        }}
      >
        <UI.SheetTrigger asChild>
          <Button variant="outline">Edit identity</Button>
        </UI.SheetTrigger>
        <UI.SheetContent size="md">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setSaved(draft);
              setOpen(false);
            }}
          >
            <UI.SheetHeader>
              <UI.SheetTitle>Edit identity</UI.SheetTitle>
              <UI.SheetDescription>
                The form wraps the header, body and footer, so Save submits it without a form id.
              </UI.SheetDescription>
            </UI.SheetHeader>
            <UI.SheetBody>
              <Stack gap={16}>
                <Field label="Name">
                  <Input
                    required
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                  />
                </Field>
                {scopes.map((scope) => (
                  <Field key={scope} label={scope}>
                    <Input readOnly mono value="granted" />
                  </Field>
                ))}
              </Stack>
            </UI.SheetBody>
            <UI.SheetFooter>
              <Button type="submit">Save identity</Button>
              <UI.SheetClose asChild>
                <Button variant="outline">Cancel</Button>
              </UI.SheetClose>
            </UI.SheetFooter>
          </form>
        </UI.SheetContent>
      </UI.Sheet>
    </ExampleCell>
  );
}
