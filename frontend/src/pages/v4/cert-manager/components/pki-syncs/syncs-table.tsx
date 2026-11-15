import { type ReactNode, useState } from "react";
import { FilterBar, type FilterBarFilter } from "@infisical/cipher/patterns/filter-bar";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import { DropdownMenuItem } from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { Pagination } from "@infisical/cipher/ui/pagination";
import { RowLink } from "@infisical/cipher/ui/row-link";
import { Tooltip, TooltipText } from "@infisical/cipher/ui/tooltip";

import { PKI_SYNC_MAP } from "@app/helpers/pkiSyncs";
import { PkiSync, PkiSyncStatus } from "@app/hooks/api/pkiSyncs/enums";
import type { TPkiSync } from "@app/hooks/api/pkiSyncs/types";

import { RESTRICTED, type Sort } from "../../../access/ui";
import { ProviderIcon } from "../../../components/provider-icon";
import { orgHref, useGo } from "../../../links";
import { destinationNameOf, usePkiSyncOption, usePkiSyncPermissions } from "./shared";
import {
  AutoSyncOff,
  copySyncId,
  PkiSyncDialog,
  type PkiSyncDialogKind,
  PkiSyncMenuItems,
  SYNC_STATE,
  SyncJobs,
  SyncStatus,
  syncStateOf,
  usePkiSyncActions
} from "./sync-parts";

const STATUS_FILTERS = [
  { value: PkiSyncStatus.Running, label: "Syncing" },
  { value: PkiSyncStatus.Succeeded, label: "Synced" },
  { value: PkiSyncStatus.Failed, label: "Failed to sync" }
];

const connectionNameOf = (sync: TPkiSync) => sync.appConnectionName || "Unknown connection";

export const pkiSyncHref = (orgId: string, sync: TPkiSync, fromApplication?: string) =>
  orgHref(
    orgId,
    `/cert-manager/integrations/${sync.id}${
      fromApplication ? `?fromApplication=${encodeURIComponent(fromApplication)}` : ""
    }`
  );

const NameCell = ({ sync, href }: { sync: TPkiSync; href: string }) => {
  const go = useGo();
  const { canRead } = usePkiSyncPermissions(sync);
  return (
    <Inline gap={6} align="center" wrap={false}>
      {canRead ? (
        <RowLink link={go.link(href)} title={sync.name} chevron={false}>
          {sync.name}
        </RowLink>
      ) : (
        <TooltipText data-row-interactive content={RESTRICTED}>
          {sync.name}
        </TooltipText>
      )}
      {sync.description && (
        <Tooltip content={sync.description}>
          <span data-row-interactive aria-label="Description">
            <Icon name="info" size="var(--cipher-size-icon-xs)" />
          </span>
        </Tooltip>
      )}
      {!sync.applicationId && (
        <TooltipText
          data-row-interactive
          content="Created outside an application. It stays editable here."
        >
          <Badge tone="soft">Legacy</Badge>
        </TooltipText>
      )}
    </Inline>
  );
};

const DestinationCell = ({ sync }: { sync: TPkiSync }) => {
  const destination = PKI_SYNC_MAP[sync.destination];
  return (
    <Inline gap={8} align="center" wrap={false}>
      <ProviderIcon icon={destination.image} alt="" size="sm" />
      {destination.name}
    </Inline>
  );
};

const StatusCell = ({ sync }: { sync: TPkiSync }) => {
  const { syncOption } = usePkiSyncOption(sync.destination);
  return (
    <Inline gap={12} align="center" wrap={false}>
      <span data-row-interactive>
        <SyncStatus sync={sync} />
      </span>
      {!sync.isAutoSyncEnabled && <AutoSyncOff />}
      <SyncJobs sync={sync} canImport={Boolean(syncOption?.canImportCertificates)} />
    </Inline>
  );
};

const RowMenu = ({
  sync,
  onOpen
}: {
  sync: TPkiSync;
  onOpen: (kind: PkiSyncDialogKind) => void;
}) => {
  const permissions = usePkiSyncPermissions(sync);
  const actions = usePkiSyncActions();
  return (
    <>
      <DropdownMenuItem
        disabledReason={permissions.canTriggerSync ? undefined : RESTRICTED}
        onSelect={() => actions.triggerSync(sync)}
      >
        <Icon name="sync" />
        Trigger sync
      </DropdownMenuItem>
      <PkiSyncMenuItems
        sync={sync}
        permissions={permissions}
        onOpen={onOpen}
        onToggleAutoSync={() => actions.toggleAutoSync(sync)}
        onCopyId={() => copySyncId(sync)}
      />
    </>
  );
};

export const PkiSyncsTable = ({
  orgId,
  syncs,
  isPending,
  error,
  fromApplication,
  label,
  actions,
  empty
}: {
  orgId: string;
  syncs: TPkiSync[];
  isPending: boolean;
  error?: unknown;
  fromApplication?: string;
  label: string;
  actions?: ReactNode;
  empty?: ReactNode;
}) => {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<FilterBarFilter[]>([]);
  const [sort, setSort] = useState<Sort>({ columnId: "name", direction: "asc" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [dialog, setDialog] = useState<{ kind: PkiSyncDialogKind; sync: TPkiSync }>();

  const picked = (field: string) => filters.find((filter) => filter.field === field)?.values ?? [];
  const statusFilter = new Set(picked("status"));
  const destinationFilter = new Set(picked("destination"));
  const needle = query.trim().toLowerCase();
  const filtered = syncs
    .filter((sync) => {
      if (destinationFilter.size && !destinationFilter.has(sync.destination)) return false;
      if (statusFilter.size && (!sync.syncStatus || !statusFilter.has(sync.syncStatus)))
        return false;
      return [destinationNameOf(sync.destination), sync.name, sync.appConnectionName].some(
        (value) => value?.toLowerCase().includes(needle)
      );
    })
    .sort((a, b) => {
      const order = (() => {
        switch (sort.columnId) {
          case "destination":
            return destinationNameOf(a.destination)
              .toLowerCase()
              .localeCompare(destinationNameOf(b.destination).toLowerCase());
          case "connection":
            return connectionNameOf(a)
              .toLowerCase()
              .localeCompare(connectionNameOf(b).toLowerCase());
          case "status":
            return SYNC_STATE[syncStateOf(a)].order - SYNC_STATE[syncStateOf(b)].order;
          default:
            return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
        }
      })();
      return sort.direction === "asc" ? order : -order;
    });

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pageCount);
  const isFiltered = Boolean(needle) || filters.some((filter) => filter.values.length > 0);

  let emptyState = empty ?? (
    <EmptyState size="sm" media="bare" icon="sync" title="No certificate syncs yet" />
  );
  if (error)
    emptyState = (
      <EmptyState
        size="sm"
        media="bare"
        icon="alert-c"
        title="Couldn't load certificate syncs"
        description={error instanceof Error ? error.message : undefined}
      />
    );
  else if (isFiltered && syncs.length)
    emptyState = (
      <EmptyState
        size="sm"
        media="bare"
        icon="search"
        title="No syncs match your filters"
        actions={
          <Button
            variant="outline"
            onClick={() => {
              setQuery("");
              setFilters([]);
              setPage(1);
            }}
          >
            Clear filters
          </Button>
        }
      />
    );

  const columns: DataTableColumn<TPkiSync>[] = [
    {
      id: "name",
      header: "Name",
      primary: true,
      sortable: true,
      grow: true,
      text: (sync) => sync.name,
      render: (sync) => <NameCell sync={sync} href={pkiSyncHref(orgId, sync, fromApplication)} />
    },
    {
      id: "destination",
      header: "Destination",
      sortable: true,
      width: 240,
      text: (sync) => destinationNameOf(sync.destination),
      render: (sync) => <DestinationCell sync={sync} />
    },
    {
      id: "connection",
      header: "Connection",
      sortable: true,
      width: 200,
      text: connectionNameOf,
      render: connectionNameOf
    },
    {
      id: "status",
      header: "Status",
      sortable: true,
      width: 260,
      text: (sync) => SYNC_STATE[syncStateOf(sync)].label,
      render: (sync) => <StatusCell sync={sync} />
    }
  ];

  const presentDestinations = [...new Set(syncs.map((sync) => sync.destination))] as PkiSync[];

  return (
    <Stack gap={16}>
      <FilterBar
        label="Certificate sync filters"
        fields={[
          { key: "status", label: "Status", type: "multi-select", options: STATUS_FILTERS },
          {
            key: "destination",
            label: "Destination",
            type: "multi-select",
            options: presentDestinations.map((destination) => ({
              value: destination,
              label: destinationNameOf(destination)
            }))
          }
        ]}
        value={filters}
        onChange={(next) => {
          setFilters(next);
          setPage(1);
        }}
        search={
          <Input
            icon="search"
            aria-label="Search certificate syncs"
            placeholder="Search certificate syncs..."
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
        }
        actions={actions}
      />
      <DataTable
        label={label}
        rows={filtered.slice((current - 1) * pageSize, current * pageSize)}
        columns={columns}
        loading={isPending && !error}
        loadingRows={5}
        getRowId={(sync) => sync.id}
        rowLabel={(sync) => `${sync.name} sync`}
        sort={sort}
        onSortChange={(next) => {
          setSort(next);
          setPage(1);
        }}
        rowActions={{
          menuLabel: "Sync options",
          renderMenu: (sync) => <RowMenu sync={sync} onOpen={(kind) => setDialog({ kind, sync })} />
        }}
        empty={emptyState}
        pagination={
          filtered.length > 0 ? (
            <Pagination
              label="Certificate sync pages"
              variant="compact"
              page={current}
              onPageChange={setPage}
              total={filtered.length}
              pageSize={pageSize}
              pageSizeOptions={[10, 20, 50, 100]}
              onPageSizeChange={(next) => {
                setPageSize(next);
                setPage(1);
              }}
            />
          ) : undefined
        }
      />
      <PkiSyncDialog dialog={dialog} onClose={() => setDialog(undefined)} />
    </Stack>
  );
};
