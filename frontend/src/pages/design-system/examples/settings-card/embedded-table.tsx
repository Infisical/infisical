import { useState } from "react";

import { Button } from "@app/components/v4/ui/button";
import { DataTable, type DataTableColumn } from "@app/components/v4/ui/data-table";
import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import { SettingsCard } from "@app/components/v4/ui/settings-card";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

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
    <ExampleGrid width="full">
      <ExampleCell label="default above flush, headers aligned" align="stretch">
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
      </ExampleCell>
    </ExampleGrid>
  );
}
