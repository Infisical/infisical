import { useState } from "react";

import { Button } from "@app/components/v4/ui/button";
import { DataTable, type DataTableColumn } from "@app/components/v4/ui/data-table";
import { DocumentationLinkBadge } from "@app/components/v4/ui/documentation-link-badge";
import { DropdownMenuItem } from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Stack } from "@app/components/v4/ui/layout";
import { Loader } from "@app/components/v4/ui/loader";
import { PageHeader } from "@app/components/v4/ui/page-header";
import { RowLink } from "@app/components/v4/ui/row-link";
import { TooltipProvider } from "@app/components/v4/ui/tooltip";
import {
  OrgKmipServerPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import type { TKmipServer } from "@app/hooks/api/kmipServers/types";

import { useOrgId, useOrgPermission } from "../../access/permissions";
import { formatDate } from "../../access/roles";
import { toast } from "../../access/toast";
import { AccessRestricted, RESTRICTED } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";
import { useGo } from "../../links";
import { CreateKmipServerDialog } from "./create-server-dialog";
import { DeleteKmipServerDialog } from "./server-dialogs";
import { KMIP_SERVER_DOCS, kmipLinks } from "./shared";

export const KmipServersPage = () => {
  const orgId = useOrgId();
  const go = useGo();
  const kmip = useV4Adapter("kmip");
  const { permission, isPending: permissionPending } = useOrgPermission();
  const canList = permission.can(
    OrgKmipServerPermissionActions.ListKmipServers,
    OrgPermissionSubjects.KmipServer
  );
  const { data, isPending, error } = kmip.useServers();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ columnId: string; direction: "asc" | "desc" }>({
    columnId: "name",
    direction: "asc"
  });
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<TKmipServer>();

  if (permissionPending) return <Loader size="page" label="Loading KMIP servers" />;
  if (!canList) return <AccessRestricted requirement="list KMIP servers" />;

  const canCreate = permission.can(
    OrgKmipServerPermissionActions.CreateKmipServers,
    OrgPermissionSubjects.KmipServer
  );
  const canDelete = permission.can(
    OrgKmipServerPermissionActions.DeleteKmipServers,
    OrgPermissionSubjects.KmipServer
  );
  const servers = data ?? [];
  const needle = search.trim().toLowerCase();
  const rows = servers
    .filter((server) => server.name.toLowerCase().includes(needle))
    .sort((a, b) => {
      const order =
        sort.columnId === "created"
          ? a.createdAt.localeCompare(b.createdAt)
          : a.name.localeCompare(b.name);
      return sort.direction === "asc" ? order : -order;
    });

  const columns: DataTableColumn<TKmipServer>[] = [
    {
      id: "name",
      header: "Name",
      primary: true,
      sortable: true,
      grow: true,
      render: (server) => (
        <RowLink {...go.link(kmipLinks.server(orgId, server.id))} title={server.name}>
          {server.name}
        </RowLink>
      )
    },
    {
      id: "created",
      header: "Created",
      sortable: true,
      width: 140,
      render: (server) => formatDate(server.createdAt)
    }
  ];

  let empty = (
    <EmptyState
      size="sm"
      icon="machine"
      title="No KMIP servers yet"
      description="Create a KMIP server to proxy KMIP requests to Infisical KMS."
    />
  );
  if (error)
    empty = (
      <EmptyState
        size="sm"
        icon="alert-c"
        title="Couldn't load KMIP servers"
        description={error instanceof Error ? error.message : undefined}
      />
    );
  else if (servers.length)
    empty = (
      <EmptyState
        size="sm"
        icon="search"
        title="No KMIP servers match this search"
        actions={
          <Button variant="link" onClick={() => setSearch("")}>
            Clear search
          </Button>
        }
      />
    );

  return (
    <TooltipProvider>
      <Stack gap={24}>
        <PageHeader
          title="KMIP servers"
          description="Proxy KMIP requests from your devices and applications to Infisical KMS."
          badges={<DocumentationLinkBadge href={KMIP_SERVER_DOCS} />}
          actions={
            <Button
              variant="accent"
              icon="plus"
              disabledReason={canCreate ? undefined : RESTRICTED}
              onClick={() => setCreating(true)}
            >
              Create KMIP server
            </Button>
          }
        />
        <Input
          icon="search"
          aria-label="Search KMIP servers"
          placeholder="Search KMIP servers by name"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <DataTable
          label="KMIP servers"
          rows={rows}
          columns={columns}
          loading={isPending && !error}
          getRowId={(server) => server.id}
          rowLabel={(server) => server.name}
          sort={sort}
          onSortChange={setSort}
          empty={empty}
          rowActions={{
            inline: [
              {
                label: "Copy KMIP server ID",
                icon: "copy",
                onSelect: (server) => {
                  navigator.clipboard?.writeText(server.id);
                  toast({ tone: "neutral", title: "KMIP server ID copied to clipboard" });
                }
              }
            ],
            renderMenu: (server) => (
              <DropdownMenuItem
                variant="destructive"
                disabled={!canDelete}
                description={canDelete ? undefined : RESTRICTED}
                onSelect={() => setDeleting(server)}
              >
                <Icon name="trash" />
                Delete KMIP server
              </DropdownMenuItem>
            )
          }}
        />
      </Stack>
      {creating && <CreateKmipServerDialog orgId={orgId} onOpenChange={setCreating} />}
      {deleting && (
        <DeleteKmipServerDialog server={deleting} onClose={() => setDeleting(undefined)} />
      )}
    </TooltipProvider>
  );
};
