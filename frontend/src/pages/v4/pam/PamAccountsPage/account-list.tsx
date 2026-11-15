import { type ReactNode, useMemo, useState } from "react";
import { FilterBar, type FilterBarFilter } from "@infisical/cipher/patterns/filter-bar";
import { Button } from "@infisical/cipher/ui/button";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Input } from "@infisical/cipher/ui/input";

import type { TPamAccountListItem, TPamAccountTypeMetadata } from "@app/hooks/api/pam";
import { useDebounce } from "@app/hooks/useDebounce";

import { useV4Adapter } from "../../data/adapters";
import { AccessState, AccountMenu, AccountName, type useAccountOverlays } from "./account-rows";

export const useAccountFilters = () => {
  const [searchInput, setSearchInput] = useState("");
  const [filters, setFilters] = useState<FilterBarFilter[]>([]);
  const [debouncedSearch] = useDebounce(searchInput);
  const accountType = filters.find((filter) => filter.field === "type")?.values[0];
  return {
    searchInput,
    setSearchInput,
    filters,
    setFilters,
    search: debouncedSearch.trim() || undefined,
    accountType,
    active: Boolean(debouncedSearch.trim() || accountType),
    clear: () => {
      setSearchInput("");
      setFilters([]);
    }
  };
};

export const AccountList = ({
  orgId,
  label,
  accounts,
  loading,
  filters,
  showFolder = false,
  overlays,
  emptyTitle,
  emptyDescription,
  emptyAction
}: {
  orgId: string;
  label: string;
  accounts: TPamAccountListItem[];
  loading: boolean;
  filters: ReturnType<typeof useAccountFilters>;
  showFolder?: boolean;
  overlays: ReturnType<typeof useAccountOverlays>;
  emptyTitle: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
}) => {
  const { data: accountTypes = [] } = useV4Adapter("pam").useAccountTypes();
  const typeMap = useMemo(
    () => new Map<string, TPamAccountTypeMetadata>(accountTypes.map((meta) => [meta.type, meta])),
    [accountTypes]
  );

  const columns: DataTableColumn<TPamAccountListItem>[] = [
    {
      id: "name",
      header: "Name",
      primary: true,
      grow: true,
      text: (account) => account.name,
      render: (account) => (
        <AccountName
          orgId={orgId}
          account={account}
          meta={typeMap.get(account.accountType)}
          showFolder={showFolder}
        />
      )
    },
    {
      id: "access",
      header: "Access",
      width: 184,
      render: (account) => <AccessState account={account} />
    }
  ];

  return (
    <>
      <FilterBar
        label={`${label} filters`}
        fields={[
          {
            key: "type",
            label: "Account type",
            type: "select",
            options: accountTypes.map((meta) => ({ value: meta.type, label: meta.name }))
          }
        ]}
        value={filters.filters}
        onChange={filters.setFilters}
        search={
          <Input
            icon="search"
            aria-label="Search accounts"
            placeholder="Search accounts..."
            slashShortcut
            value={filters.searchInput}
            onChange={(event) => filters.setSearchInput(event.target.value)}
          />
        }
      />
      <DataTable
        label={label}
        rows={accounts}
        columns={columns}
        loading={loading}
        loadingRows={5}
        getRowId={(account) => account.id}
        rowLabel={(account) => account.name}
        rowActions={{
          menuLabel: "Account options",
          renderMenu: (account) => (
            <AccountMenu
              orgId={orgId}
              account={account}
              onConfigure={(tab) => overlays.openAccount(account.id, tab)}
              onRequestAccess={(accessType) => overlays.openRequestAccess(account, accessType)}
              onViewCredentials={() => overlays.openCredentials(account)}
              onDelete={() =>
                overlays.openDeleteAccount({
                  id: account.id,
                  name: account.name,
                  accountType: account.accountType,
                  typeName: typeMap.get(account.accountType)?.name
                })
              }
            />
          )
        }}
        empty={
          filters.active ? (
            <EmptyState
              size="sm"
              media="bare"
              icon="search"
              title="No accounts match your filters"
              actions={
                <Button variant="outline" onClick={filters.clear}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              size="sm"
              media="bare"
              icon="folder"
              title={emptyTitle}
              description={emptyDescription}
              actions={emptyAction}
            />
          )
        }
      />
    </>
  );
};
