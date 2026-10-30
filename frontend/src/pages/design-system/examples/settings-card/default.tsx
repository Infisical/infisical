import { useState } from "react";

import * as Confirm from "@app/components/v4/ui/alert-dialog";
import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import { SettingsCard } from "@app/components/v4/ui/settings-card";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

const wait = (ms: number) =>
  new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });

export default function Example() {
  const [saved, setSaved] = useState("payments-api");
  const [name, setName] = useState("payments-api");
  const [deleted, setDeleted] = useState(false);
  return (
    <ExampleGrid width="full">
      <ExampleCell label="default" align="stretch">
        <SettingsCard
          title="Project name"
          description="Shown in the sidebar, the top bar and audit logs."
          dirty={name !== saved}
          hint="Names can use up to 64 characters."
          onDiscard={() => setName(saved)}
          onSave={async () => {
            await wait(800);
            if (!name.trim()) throw new Error("Enter a project name, then save again.");
            setSaved(name);
          }}
        >
          <Field label="Name">
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
        </SettingsCard>
      </ExampleCell>
      <ExampleCell label="Locked for non-admins" align="stretch">
        <SettingsCard
          title="Audit log retention"
          description="How long audit events are kept."
          action={<Badge>Admins</Badge>}
          locked="Only organization admins can change retention. Ask Sarah Lin."
        >
          <Field label="Days">
            <Input value="90" readOnly />
          </Field>
        </SettingsCard>
      </ExampleCell>
      <ExampleCell label="danger" align="stretch">
        <SettingsCard
          tone="danger"
          title="Delete project"
          description="Deletes payments-api with its 412 secrets for everyone. This cannot be undone."
          hint={
            deleted
              ? "Deleted payments-api in this example."
              : "Export secrets first if you need a copy."
          }
          actions={
            <Confirm.AlertDialog>
              <Confirm.AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={deleted}>
                  Delete project
                </Button>
              </Confirm.AlertDialogTrigger>
              <Confirm.AlertDialogContent>
                <Confirm.AlertDialogHeader>
                  <Confirm.AlertDialogTitle>Delete payments-api?</Confirm.AlertDialogTitle>
                  <Confirm.AlertDialogDescription>
                    Its 412 secrets are deleted for everyone.
                  </Confirm.AlertDialogDescription>
                </Confirm.AlertDialogHeader>
                <Confirm.AlertDialogFooter>
                  <Confirm.AlertDialogCancel>Cancel</Confirm.AlertDialogCancel>
                  <Confirm.AlertDialogAction asChild>
                    <Button variant="destructive" onClick={() => setDeleted(true)}>
                      Delete payments-api
                    </Button>
                  </Confirm.AlertDialogAction>
                </Confirm.AlertDialogFooter>
              </Confirm.AlertDialogContent>
            </Confirm.AlertDialog>
          }
        >
          <Field label="Project slug">
            <Input value="payments" readOnly />
          </Field>
        </SettingsCard>
      </ExampleCell>
    </ExampleGrid>
  );
}
