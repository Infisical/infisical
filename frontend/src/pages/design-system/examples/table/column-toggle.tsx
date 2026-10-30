import * as React from "react";

import { DataTable, type DataTableColumn } from "@app/components/v4/ui/data-table";
import { Meta } from "@app/components/v4/ui/text";

import { ExampleStack } from "../../example-presentation";

type Action = "read" | "create" | "edit" | "delete";
type Policy = { id: string; subject: string; managed?: boolean; allowed: Action[] };

const actions: { id: Action; header: string }[] = [
  { id: "read", header: "Read" },
  { id: "create", header: "Create" },
  { id: "edit", header: "Edit" },
  { id: "delete", header: "Delete" }
];

const initial: Policy[] = [
  { id: "secrets", subject: "Secrets", allowed: ["read", "create", "edit"] },
  { id: "folders", subject: "Secret folders", allowed: ["read"] },
  { id: "imports", subject: "Secret imports", allowed: [] },
  { id: "rotation", subject: "Secret rotation", allowed: ["read"] },
  { id: "audit", subject: "Audit logs", managed: true, allowed: ["read"] }
];

export default function ColumnToggle() {
  const [policies, setPolicies] = React.useState(initial);
  const [status, setStatus] = React.useState("No changes yet.");
  const columns: DataTableColumn<Policy>[] = [
    {
      id: "subject",
      header: "Policy",
      primary: true,
      grow: true,
      text: (row) => row.subject,
      render: (row) => row.subject
    },
    ...actions.map((action): DataTableColumn<Policy> => ({
      id: action.id,
      header: action.header,
      width: 112,
      toggle: {
        checked: (row) => row.allowed.includes(action.id),
        disabledReason: (row) =>
          row.managed ? "Managed by Infisical. Audit log access cannot change." : undefined,
        onChange: (ids, checked) => {
          setPolicies((current) =>
            current.map((row) =>
              ids.includes(row.id)
                ? {
                    ...row,
                    allowed: checked
                      ? [...row.allowed, action.id]
                      : row.allowed.filter((item) => item !== action.id)
                  }
                : row
            )
          );
          setStatus(
            `${checked ? "Allowed" : "Removed"} ${action.header.toLowerCase()} on ${ids.length} ${ids.length === 1 ? "policy" : "policies"}.`
          );
        }
      }
    }))
  ];
  return (
    <ExampleStack>
      <DataTable
        label="Developer role permissions"
        rows={policies}
        columns={columns}
        getRowId={(row) => row.id}
        rowLabel={(row) => row.subject}
      />
      <Meta role="status">{status}</Meta>
    </ExampleStack>
  );
}
