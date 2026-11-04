import { useMemo, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@app/components/v4/ui/alert-dialog";
import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import {
  DataTable,
  type DataTableColumn,
  type DataTableRowActions
} from "@app/components/v4/ui/data-table";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Icon } from "@app/components/v4/ui/icon";
import { Stack } from "@app/components/v4/ui/layout";
import {
  ProjectPermissionActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import type { ServiceToken } from "@app/hooks/api/serviceTokens/types";

import { useV4Adapter } from "../../data/adapters";
import { useProjectPermission } from "../permissions";
import { formatDateTime } from "../roles";
import { failed, saved } from "../toast";
import { Gate, ListToolbar, Muted, RESTRICTED, usePagedList } from "../ui";
import { useProjectScope } from "./scope";
import { ServiceTokenCreateSheet } from "./service-token-create-sheet";

import shared from "../access.module.css";
import styles from "./tokens-roles.module.css";

const expiryOf = (token: ServiceToken) =>
  token.expiresAt ? new Date(token.expiresAt).getTime() : undefined;

export const ServiceTokensTab = () => {
  const { projectId } = useProjectScope();
  const access = useV4Adapter("access");
  const { permission } = useProjectPermission(projectId);
  const tokens = access.useServiceTokens({ workspaceID: projectId });
  const deleteToken = access.useDeleteServiceToken();
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<ServiceToken>();
  const canCreate = permission.can(
    ProjectPermissionActions.Create,
    ProjectPermissionSub.ServiceTokens
  );
  const canDelete = permission.can(
    ProjectPermissionActions.Delete,
    ProjectPermissionSub.ServiceTokens
  );

  const rows = useMemo(() => tokens.data ?? [], [tokens.data]);
  const list = usePagedList({
    rows,
    initialSort: { columnId: "name", direction: "asc" },
    matches: (token, needle) =>
      token.name.toLowerCase().includes(needle) ||
      token.scopes.some(
        ({ environment, secretPath }) =>
          environment.toLowerCase().includes(needle) || secretPath.toLowerCase().includes(needle)
      ),
    compare: (a, b, column) => {
      if (column !== "expiration") return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      const [one, two] = [expiryOf(a), expiryOf(b)];
      if (one === undefined && two === undefined) return 0;
      if (one === undefined) return 1;
      if (two === undefined) return -1;
      return one - two;
    }
  });

  const columns: DataTableColumn<ServiceToken>[] = [
    {
      id: "name",
      header: "Name",
      sortable: true,
      render: (token) => <span>{token.name}</span>
    },
    {
      id: "scopes",
      header: "Environment / Secret path",
      render: (token) => (
        <span className={styles.scopes}>
          {token.scopes.map(({ environment, secretPath }) => (
            <Badge key={`${environment}-${secretPath}`} tone="soft">
              <span className={styles.scopeEnv}>{environment}</span>
              <Icon name="folder" size={12} />
              <span>{secretPath}</span>
            </Badge>
          ))}
        </span>
      )
    },
    {
      id: "expiration",
      header: "Valid until",
      sortable: true,
      render: (token) =>
        token.expiresAt ? <span>{formatDateTime(token.expiresAt)}</span> : <Muted>-</Muted>
    }
  ];

  const rowActions: DataTableRowActions<ServiceToken> = {
    inline: [
      {
        label: "Delete token",
        icon: "trash",
        disabledReason: () => (canDelete ? undefined : RESTRICTED),
        onSelect: setDeleting
      }
    ]
  };

  const remove = async () => {
    const token = deleting;
    setDeleting(undefined);
    if (!token) return;
    try {
      await deleteToken.mutateAsync(token.id);
      saved("Successfully deleted service token");
    } catch (error) {
      failed("Failed to delete service token", error);
    }
  };

  return (
    <Stack gap={16}>
      <div className={shared.toolbar}>
        <div className={shared.grow}>
          <ListToolbar
            search={list.search}
            onSearch={list.setSearch}
            placeholder="Search service tokens by name, environment or secret path..."
          />
        </div>
        <Gate allowed={canCreate}>
          <Button
            variant="accent"
            icon="plus"
            disabled={!canCreate}
            onClick={() => setCreating(true)}
          >
            Create token
          </Button>
        </Gate>
      </div>
      <Stack gap={8}>
        <DataTable
          label="Service tokens"
          rows={list.pageRows}
          columns={columns}
          rowActions={rowActions}
          getRowId={(token) => token.id}
          rowLabel={(token) => token.name}
          loading={tokens.isPending}
          loadingRows={10}
          sort={list.sort}
          onSortChange={list.setSort}
          empty={
            list.search.trim() ? (
              <EmptyState
                size="sm"
                icon="search"
                title="No service tokens match search"
                description="Adjust your search criteria."
              />
            ) : (
              <EmptyState
                size="sm"
                icon="key"
                title="No service tokens found"
                description="Create a token to get started."
              />
            )
          }
        />
        {!tokens.isPending && list.pagination}
      </Stack>
      <ServiceTokenCreateSheet projectId={projectId} open={creating} onOpenChange={setCreating} />
      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(undefined)}
      >
        <AlertDialogContent tone="danger" confirmText={deleting?.name.trim() || "service token"}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete token?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently revokes the service token and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={remove}>
              Delete token
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Stack>
  );
};
