import { Avatar } from "@app/components/v4/ui/avatar";
import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { DataTable, type DataTableColumn } from "@app/components/v4/ui/data-table";
import { Input } from "@app/components/v4/ui/input";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { PageHeader } from "@app/components/v4/ui/page-header";
import { Tabs } from "@app/components/v4/ui/tabs";

import { Shell, useCrumbs } from "./shared";

type UserRow = { id: string; name: string; email: string; role: string; serverAdmin?: boolean };
const users: UserRow[] = [
  { id: "diego", name: "Diego Alvarez", email: "diego@acme.dev", role: "Member" },
  { id: "hana", name: "Hana Kim", email: "hana@acme.dev", role: "Security auditor" },
  { id: "lena", name: "Lena Novak", email: "lena@acme.dev", role: "No access" },
  { id: "marcus", name: "Marcus Webb", email: "marcus@acme.dev", role: "Admin" },
  { id: "priya", name: "Priya Raman", email: "priya@acme.dev", role: "Member" },
  { id: "sarah", name: "Sarah Lin", email: "sarah@acme.dev", role: "Admin", serverAdmin: true },
  { id: "tom", name: "Tom Becker", email: "tom@acme.dev", role: "Release manager" }
];
const userColumns: DataTableColumn<UserRow>[] = [
  {
    id: "name",
    header: "Name",
    primary: true,
    sortable: true,
    width: 420,
    text: (r) => r.name,
    render: (r) => (
      <Inline gap={12} align="center">
        <Avatar size={24} name={r.name} kind="person" />
        {r.name}
        {r.serverAdmin && <Badge tone="info">Server admin</Badge>}
      </Inline>
    )
  },
  {
    id: "email",
    header: "Username",
    sortable: true,
    grow: true,
    text: (r) => r.email,
    render: (r) => r.email
  },
  {
    id: "role",
    header: "Organization role",
    width: 220,
    render: (r) => <Badge tone={r.role === "No access" ? "outline" : "soft"}>{r.role}</Badge>
  },
  {
    id: "actions",
    header: "Actions",
    actions: true,
    hideHeader: true,
    render: (r) => (
      <Button variant="ghost" size="icon-sm" icon="more" iconOnly>
        {`Actions for ${r.name}`}
      </Button>
    )
  }
];
export default function Access() {
  const { org } = useCrumbs();
  return (
    <Shell level="org" current="access" crumbs={[org, { label: "Access control" }]}>
      <Stack gap={24}>
        <PageHeader
          title="Access control"
          description="Manage fine-grained access for users, groups, roles, and machine identities within your organization."
          actions={
            <Button variant="primary" icon="user-plus">
              Invite users
            </Button>
          }
          tabs={
            <Tabs
              label="Access sections"
              defaultValue="users"
              tabs={[
                { value: "users", label: "Users", count: 7, content: null },
                { value: "identities", label: "Machine identities", content: null },
                { value: "groups", label: "Groups", content: null },
                { value: "roles", label: "Roles", count: 5, content: null }
              ]}
            />
          }
        />
        <Inline gap={8}>
          <div style={{ flex: 1 }}>
            <Input icon="search" placeholder="Search organization users" />
          </div>
          <Button variant="outline" icon="settings">
            Filter
          </Button>
        </Inline>
        <DataTable
          label="Organization users"
          rows={users}
          columns={userColumns}
          getRowId={(r) => r.id}
          rowLabel={(r) => r.name}
          selectable
          isSelectable={(r) => !r.serverAdmin}
          sort={{ columnId: "name", direction: "asc" }}
          footer="7 users"
        />
      </Stack>
    </Shell>
  );
}
