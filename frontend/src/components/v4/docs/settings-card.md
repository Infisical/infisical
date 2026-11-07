# Settings card

One setting, or a few that save together, with a footer that shows status and Save.

## Choose this component

Choose SettingsCard when a setting saves explicitly. Use a plain Card and a Toast for settings that apply instantly.

## Usage rules

### settings-card-errors

Owner: settings-card.

When a save fails.

Do: Reject with an Error whose message says what failed and what to do, and keep what was typed.

Avoid: Clear the fields or show a generic Something went wrong.

Why: People should be able to fix the value and save again without retyping.

Checked by: review only. Look for: Clear the name in the example and save; the message explains the fix and the field keeps its value.

Source evidence:
- src/components/v4/ui/settings-card.tsx
- src/pages/design-system/examples/settings-card/default.tsx

### settings-card-danger

Owner: settings-card.

When a setting destroys data.

Do: Use tone danger, place the card last on the page and open an AlertDialog that names the object from its action.

Avoid: Put a destructive action in an ordinary card's Save button.

Why: Destructive settings need a distinct boundary and a confirmation that names what is lost.

Checked by: review only. Look for: Check that danger cards come last and that their action confirms with the object's name.

Source evidence:
- src/components/v4/ui/settings-card.tsx
- src/pages/design-system/examples/settings-card/default.tsx

## State guidance

- dirty: A 6px warn mark and Unsaved changes; Save enables and Discard appears.
- locked: The lock icon and the reason replace the buttons.

## Presentation rules

Do: Name the setting with a noun and say what it affects in the description.

Avoid: Write instructions such as Use this card to change your name.

Why: The title and fields already say what to do.

## Import and exports

- src/components/v4/ui/settings-card.tsx
- src/components/v4/ui/settings-card.module.css

Exports: SettingsCard. Source TypeScript defines the API.

## Behavior

- The footer shows one status at a time: the hint, Unsaved changes, Saving, Saved for three seconds, the failure message, or the lock reason.
- Save runs from the button or Enter in a field. A returned promise shows Saving; a rejection shows the Error's message and keeps the typed values.
- Discard appears only while there are changes and calls onDiscard.
- locked disables the fields, hides the buttons and shows the reason. tone danger draws the bad line and wash and shows your own actions.
- flush renders the same header with the body edge to edge under a line-soft rule and no form or footer, for content that is not saved by the card, such as a list of incident contacts in a DataTable.
- The body is a frame scope, so a DataTable, List or CodeBlock inside embeds frameless and a framed Card drops to plain instead of nesting a second frame.

## Accessibility

- The card is a section named by its title, and the footer status is a polite live region.
- Fields stay in a native form, so Enter submits.

## Use cases

- Use SettingsCard for settings someone changes and saves together, one card per decision.

## Avoid

- Wrap settings that apply instantly, such as a lone Switch, or several unrelated settings in one card.

## Limits

- The host keeps the values and passes dirty; the card does not compare values itself.
- Locked fields use a disabled fieldset, so they look disabled rather than read-only.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### tone

- default: example `default`, visible label "default".
- danger: example `default`, visible label "danger".

## Executable examples

### Save, locked and danger

Save this example at `src/pages/design-system/examples/settings-card/default.tsx`; its relative imports are generated for that exact path. States: default, editing, loading, success, error, read-only.

Registry items used: @infisical/alert-dialog, @infisical/badge, @infisical/button, @infisical/field, @infisical/input, @infisical/settings-card. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";

import * as Confirm from "../../../../components/v4/ui/alert-dialog";
import { Badge } from "../../../../components/v4/ui/badge";
import { Button } from "../../../../components/v4/ui/button";
import { Field } from "../../../../components/v4/ui/field";
import { Input } from "../../../../components/v4/ui/input";
import { SettingsCard } from "../../../../components/v4/ui/settings-card";

const wait = (ms: number) =>
  new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });

export default function Example() {
  const [saved, setSaved] = useState("payments-api");
  const [name, setName] = useState("payments-api");
  const [deleted, setDeleted] = useState(false);
  return (
    <div className="grid w-full min-w-0 grid-cols-1 items-start gap-x-6 gap-y-8">
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
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
        </div>
        <figcaption className="text-muted-foreground text-xs">{"default"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
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
        </div>
        <figcaption className="text-muted-foreground text-xs">{"Locked for non-admins"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
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
        </div>
        <figcaption className="text-muted-foreground text-xs">{"danger"}</figcaption>
      </figure>
    </div>
  );
}
```

### Embedded table

Save this example at `src/pages/design-system/examples/settings-card/embedded-table.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/button, @infisical/data-table, @infisical/field, @infisical/input, @infisical/settings-card. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";

import { Button } from "../../../../components/v4/ui/button";
import { DataTable, type DataTableColumn } from "../../../../components/v4/ui/data-table";
import { Field } from "../../../../components/v4/ui/field";
import { Input } from "../../../../components/v4/ui/input";
import { SettingsCard } from "../../../../components/v4/ui/settings-card";

type Contact = { email: string; added: string };

const contacts: Contact[] = [
  { email: "sarah.lin@acme-payments.example.com", added: "Mar 4, 2026" },
  { email: "oncall-security-escalations-primary@acme-payments.example.com", added: "Jan 12, 2026" },
  { email: "d.okafor@acme-payments.example.com", added: "Nov 30, 2025" }
];

export default function Example() {
  const [rows, setRows] = useState(contacts);
  const [name, setName] = useState("Acme Payments");
  const [saved, setSaved] = useState("Acme Payments");
  const columns: DataTableColumn<Contact>[] = [
    {
      id: "email",
      header: "Email",
      grow: true,
      text: (row) => row.email,
      render: (row) => row.email
    },
    {
      id: "added",
      header: "Added",
      width: 140,
      text: (row) => row.added,
      render: (row) => row.added
    },
    {
      id: "actions",
      header: "Actions",
      actions: true,
      render: (row) => (
        <Button
          variant="ghost"
          size="icon-row"
          icon="trash"
          iconOnly
          onClick={() => setRows((current) => current.filter((item) => item.email !== row.email))}
        >
          {`Remove ${row.email}`}
        </Button>
      )
    }
  ];
  return (
    <div className="grid w-full min-w-0 grid-cols-1 items-start gap-x-6 gap-y-8">
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <div className="flex flex-col gap-4">
            <SettingsCard
              title="Organization name"
              dirty={name !== saved}
              onDiscard={() => setName(saved)}
              onSave={() => setSaved(name)}
            >
              <Field label="Name">
                <Input value={name} onChange={(event) => setName(event.target.value)} />
              </Field>
            </SettingsCard>
            <SettingsCard
              flush
              title="Incident contacts"
              description="Emailed when a secret leak or a failed rotation is detected."
              action={
                <Button variant="outline" size="sm" icon="plus">
                  Add contact
                </Button>
              }
            >
              <DataTable
                label="Incident contacts"
                rows={rows}
                columns={columns}
                getRowId={(row) => row.email}
                rowLabel={(row) => row.email}
                empty="No incident contacts"
              />
            </SettingsCard>
          </div>
        </div>
        <figcaption className="text-muted-foreground text-xs">
          {"default above flush, headers aligned"}
        </figcaption>
      </figure>
    </div>
  );
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run dev; open /design-system#settings-card and exercise the documented interaction.
