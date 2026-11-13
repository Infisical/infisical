import { useState } from "react";
import { FilterBar } from "@infisical/cipher/patterns/filter-bar";
import { Badge } from "@infisical/cipher/ui/badge";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import { DropdownMenuItem } from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { UserCogIcon } from "lucide-react";

import type { Identity } from "@app/hooks/api/identities/types";
import { useDebounce } from "@app/hooks/useDebounce";

import { saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { ConfirmDialog, pagination, usePageReset, usePaging } from "./shared";

export const IdentitiesTab = () => {
  const admin = useV4Adapter("admin");
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 500);
  const paging = usePaging("ResourceOverviewIdentitiesTable", 10);
  const { data, isPending, error } = admin.useIdentities({
    limit: paging.perPage,
    offset: paging.offset,
    searchTerm: debouncedSearch
  });
  const identities = data?.identities ?? [];
  const totalCount = data?.totalCount ?? 0;
  usePageReset(paging, totalCount);
  const removeAdmin = admin.useRemoveIdentityServerAdminAccess();
  const [revoking, setRevoking] = useState<Identity>();

  if (error) throw error;

  const columns: DataTableColumn<Identity>[] = [
    {
      id: "name",
      header: "Name",
      primary: true,
      grow: true,
      text: (identity) => identity.name,
      render: (identity) => (
        <Inline gap={8} align="center" wrap={false}>
          <span>{identity.name}</span>
          {identity.isInstanceAdmin && (
            <Badge tone="info">
              <Icon icon={UserCogIcon} size={12} />
              Server admin
            </Badge>
          )}
        </Inline>
      )
    }
  ];

  return (
    <Stack gap={16}>
      <FilterBar
        label="Machine identity filters"
        fields={[]}
        value={[]}
        onChange={() => undefined}
        search={
          <Input
            icon="search"
            aria-label="Search machine identities"
            placeholder="Search machine identities by name..."
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              paging.setPage(1);
            }}
          />
        }
      />
      <DataTable
        label="Machine identities"
        rows={identities}
        columns={columns}
        loading={isPending}
        loadingRows={10}
        getRowId={(identity) => identity.id}
        rowLabel={(identity) => identity.name}
        rowActions={{
          menuLabel: "Machine identity options",
          menuDisabledReason: (identity) =>
            identity.isInstanceAdmin ? undefined : "This machine identity isn't a server admin",
          renderMenu: (identity) => (
            <DropdownMenuItem variant="destructive" onSelect={() => setRevoking(identity)}>
              <Icon name="x" />
              Remove server admin
            </DropdownMenuItem>
          )
        }}
        empty={
          debouncedSearch ? (
            <EmptyState size="sm" icon="search" title="No machine identities match search" />
          ) : (
            <EmptyState size="sm" icon="machine" title="No identities found" />
          )
        }
        pagination={pagination(paging, totalCount, "Machine identity pages")}
      />
      <ConfirmDialog
        open={Boolean(revoking)}
        onOpenChange={(open) => !open && setRevoking(undefined)}
        title={`Remove server admin access from ${revoking?.name ?? ""}?`}
        description="You can grant server admin access again later."
        confirmText="confirm"
        actionLabel="Remove access"
        onConfirm={async () => {
          if (!revoking) return;
          await removeAdmin.mutateAsync(revoking.id);
          saved("Successfully removed server admin permissions");
        }}
      />
    </Stack>
  );
};
