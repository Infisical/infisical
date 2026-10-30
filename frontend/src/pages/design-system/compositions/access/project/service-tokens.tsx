import { useState } from "react";
import { format } from "date-fns";

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
import { DataTable, type DataTableColumn } from "@app/components/v4/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Icon } from "@app/components/v4/ui/icon";
import { Stack } from "@app/components/v4/ui/layout";

import { useAccess } from "../context";
import type { ServiceToken } from "../model";
import { Gate, ListToolbar, Muted, useCan, usePagedList } from "../ui";
import { ServiceTokenCreateSheet } from "./service-token-create-sheet";

import shared from "../access.module.css";
import styles from "./tokens-roles.module.css";

const expiryOf = (token: ServiceToken) =>
  token.expiresAt ? new Date(token.expiresAt).getTime() : undefined;

export const ServiceTokensTab = () => {
  const { data, update, saved, loading, startsWith } = useAccess();
  const can = useCan("project");
  const [creating, setCreating] = useState(() => startsWith("create"));
  const [deleting, setDeleting] = useState<ServiceToken>();

  const list = usePagedList({
    rows: data.serviceTokens,
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
        token.expiresAt ? (
          <span>{format(new Date(token.expiresAt), "MMM d, yyyy h:mm aa")}</span>
        ) : (
          <Muted>-</Muted>
        )
    },
    {
      id: "actions",
      header: "Actions",
      actions: true,
      render: (token) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-row" icon="more" iconOnly>
              {`${token.name} actions`}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              variant="destructive"
              disabled={!can("service-token", "delete")}
              onSelect={() => setDeleting(token)}
            >
              <Icon name="trash" />
              Delete token
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    }
  ];

  const searching = Boolean(list.search.trim());

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
        <Gate allowed={can("service-token", "create")}>
          <Button
            variant="primary"
            icon="plus"
            disabled={!can("service-token", "create")}
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
          getRowId={(token) => token.id}
          rowLabel={(token) => token.name}
          loading={loading}
          loadingRows={10}
          sort={list.sort}
          onSortChange={list.setSort}
          empty={
            searching ? (
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
        {!loading && list.pagination}
      </Stack>
      <ServiceTokenCreateSheet
        open={creating}
        onOpenChange={setCreating}
        initialName={startsWith("create") ? "preview-deploy-read" : undefined}
      />
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
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleting)
                  update((current) => ({
                    ...current,
                    serviceTokens: current.serviceTokens.filter((t) => t.id !== deleting.id)
                  }));
                setDeleting(undefined);
                saved("Successfully deleted service token");
              }}
            >
              Delete token
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Stack>
  );
};
