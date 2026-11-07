import * as React from "react";

import { Badge } from "@app/components/v4/ui/badge";
import {
  DataTable,
  type DataTableColumn,
  type DataTableGroup
} from "@app/components/v4/ui/data-table";
import { DropdownMenuItem } from "@app/components/v4/ui/dropdown-menu";
import { Icon } from "@app/components/v4/ui/icon";
import { Inline } from "@app/components/v4/ui/layout";
import { RowActions } from "@app/components/v4/ui/table";
import { Meta } from "@app/components/v4/ui/text";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

type Account = { id: string; name: string; type: string; lastAccess: string };
type Resource = { id: string; name: string; accounts: Account[] };
type Sort = { columnId: string; direction: "asc" | "desc" };

const resources: Resource[] = [
  {
    id: "prod-postgres",
    name: "prod-postgres",
    accounts: [
      { id: "pg-readonly", name: "readonly", type: "PostgreSQL", lastAccess: "2 hours ago" },
      { id: "pg-admin", name: "admin", type: "PostgreSQL", lastAccess: "3 days ago" },
      { id: "pg-migrator", name: "migrator", type: "PostgreSQL", lastAccess: "Never" }
    ]
  },
  {
    id: "billing-mysql",
    name: "billing-mysql",
    accounts: [
      { id: "my-reporting", name: "reporting", type: "MySQL", lastAccess: "Yesterday" },
      { id: "my-root", name: "root", type: "MySQL", lastAccess: "2 weeks ago" }
    ]
  },
  {
    id: "bastion",
    name: "bastion.internal",
    accounts: [{ id: "ssh-ops", name: "ops", type: "SSH", lastAccess: "5 minutes ago" }]
  }
];

type Node = { id: string; name: string; kind: "resource" | "account"; children?: Node[] };
const tree: Node[] = resources.slice(0, 2).map((resource) => ({
  id: resource.id,
  name: resource.name,
  kind: "resource",
  children: resource.accounts.map((account) => ({
    id: account.id,
    name: account.name,
    kind: "account"
  }))
}));

export default function GroupedRows() {
  const [sort, setSort] = React.useState<Sort>({ columnId: "name", direction: "asc" });
  const [selected, setSelected] = React.useState<string[]>([]);
  const [status, setStatus] = React.useState("Nothing opened yet.");
  const groups: DataTableGroup<Account>[] = resources.map((resource) => ({
    id: resource.id,
    label: (
      <Inline gap={8} align="center" wrap={false}>
        <Icon name="machine" />
        <span>{resource.name}</span>
      </Inline>
    ),
    meta: `${resource.accounts.length} ${resource.accounts.length === 1 ? "account" : "accounts"}`,
    actions: (
      <RowActions
        label={resource.name}
        menu={
          <DropdownMenuItem onSelect={() => setStatus(`Copied the ID of ${resource.name}.`)}>
            <Icon name="copy" />
            Copy resource ID
          </DropdownMenuItem>
        }
      />
    ),
    rows: [...resource.accounts].sort(
      (a, b) => a.name.localeCompare(b.name) * (sort.direction === "asc" ? 1 : -1)
    )
  }));
  const columns: DataTableColumn<Account>[] = [
    {
      id: "name",
      header: "Account",
      primary: true,
      grow: true,
      sortable: true,
      text: (row) => row.name,
      render: (row) => (
        <Inline gap={8} align="center" wrap={false}>
          <Icon name="user" />
          <span>{row.name}</span>
          <Badge tone="outline">{row.type}</Badge>
        </Inline>
      )
    },
    { id: "access", header: "Last access", width: 160, render: (row) => row.lastAccess }
  ];
  const treeColumns: DataTableColumn<Node>[] = [
    {
      id: "name",
      header: "Name",
      primary: true,
      grow: true,
      text: (row) => row.name,
      render: (row) => (
        <Inline gap={8} align="center" wrap={false}>
          <Icon name={row.kind === "resource" ? "machine" : "user"} />
          <span>{row.name}</span>
        </Inline>
      )
    },
    {
      id: "kind",
      header: "Kind",
      width: 120,
      render: (row) => (row.kind === "resource" ? "Resource" : "Account")
    }
  ];
  return (
    <ExampleGrid width="full">
      <ExampleCell align="stretch" label="Accounts grouped by resource, sorted within each group">
        <DataTable
          label="Accounts by resource"
          groups={groups}
          columns={columns}
          getRowId={(row) => row.id}
          rowLabel={(row) => row.name}
          sort={sort}
          onSortChange={setSort}
          selectable
          selectedIds={selected}
          onSelectionChange={setSelected}
          onRowActivate={(row) => setStatus(`Opened ${row.name}.`)}
          rowActions={{
            inline: [
              {
                label: "Launch session",
                icon: "terminal",
                onSelect: (row) => setStatus(`Launched a session as ${row.name}.`)
              }
            ],
            renderMenu: (row) => (
              <DropdownMenuItem onSelect={() => setStatus(`Copied the ID of ${row.name}.`)}>
                <Icon name="copy" />
                Copy account ID
              </DropdownMenuItem>
            )
          }}
          footer={<Meta mono={false}>{status}</Meta>}
        />
      </ExampleCell>
      <ExampleCell align="stretch" label="Child rows under a parent row">
        <DataTable
          label="Resources and their accounts"
          rows={tree}
          getRowChildren={(row) => row.children}
          columns={treeColumns}
          getRowId={(row) => row.id}
          rowLabel={(row) => row.name}
        />
      </ExampleCell>
    </ExampleGrid>
  );
}
