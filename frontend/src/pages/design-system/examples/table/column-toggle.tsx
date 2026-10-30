import * as React from "react";
import { BanIcon, FilterIcon } from "lucide-react";

import { Button } from "@app/components/v4/ui/button";
import { DataTable, type DataTableColumn } from "@app/components/v4/ui/data-table";
import { Icon } from "@app/components/v4/ui/icon";
import { Meta } from "@app/components/v4/ui/text";
import { Tooltip } from "@app/components/v4/ui/tooltip";

import { ExampleStack } from "../../example-presentation";

type Action = "read" | "create" | "edit" | "delete";
type Grant = boolean | "some";
type Policy = {
  id: string;
  subject: string;
  managed?: boolean;
  actions: Action[];
  grants: Partial<Record<Action, Grant>>;
  conditions?: Partial<Record<Action, string>>;
  forbid?: Partial<Record<Action, string>>;
};

const actions: { id: Action; header: string }[] = [
  { id: "read", header: "Read" },
  { id: "create", header: "Create" },
  { id: "edit", header: "Edit" },
  { id: "delete", header: "Delete" }
];
const all: Action[] = ["read", "create", "edit", "delete"];

const initial: Policy[] = [
  {
    id: "secrets",
    subject: "Secrets",
    actions: all,
    grants: { read: true, create: true, edit: true },
    conditions: { edit: "Only in /payments, staging and production" }
  },
  {
    id: "folders",
    subject: "Secret folders",
    actions: all,
    grants: { read: "some" },
    conditions: { read: "Two rules: /payments allowed, /legacy forbidden" },
    forbid: { delete: "Forbidden by the Read only folders rule" }
  },
  { id: "imports", subject: "Secret imports", actions: all, grants: {} },
  { id: "rotation", subject: "Secret rotation", actions: ["read", "edit"], grants: { read: true } },
  { id: "audit", subject: "Audit logs", managed: true, actions: ["read"], grants: { read: true } }
];

function Mark({ kind, text }: { kind: "condition" | "forbid"; text: string }) {
  return (
    <Tooltip content={text}>
      <Button type="button" variant="ghost" size="icon-row">
        <Icon icon={kind === "condition" ? FilterIcon : BanIcon} />
        <span className="sr-only">
          {kind === "condition" ? `Conditions: ${text}` : `Forbidden: ${text}`}
        </span>
      </Button>
    </Tooltip>
  );
}

const markFor = (action: Action) => (row: Policy) => {
  const condition = row.conditions?.[action];
  const forbid = row.forbid?.[action];
  if (forbid) return <Mark kind="forbid" text={forbid} />;
  return condition ? <Mark kind="condition" text={condition} /> : null;
};

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
      width: 120,
      toggle: {
        checked: (row) => {
          const grant = row.grants[action.id] ?? false;
          return grant === "some" ? "indeterminate" : grant;
        },
        absent: (row) => !row.actions.includes(action.id),
        disabledReason: (row) =>
          row.managed ? "Managed by Infisical. Audit log access cannot change." : undefined,
        adornment: markFor(action.id),
        onChange: (ids, checked) => {
          setPolicies((current) =>
            current.map((row) =>
              ids.includes(row.id)
                ? { ...row, grants: { ...row.grants, [action.id]: checked } }
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
