import { useEffect, useState } from "react";
import type { FieldValues } from "react-hook-form";
import { FilterBar, type FilterBarFilter } from "@infisical/cipher/patterns/filter-bar";
import { Button } from "@infisical/cipher/ui/button";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import { DocumentationLinkBadge } from "@infisical/cipher/ui/documentation-link-badge";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { MiddleTruncate } from "@infisical/cipher/ui/middle-truncate";
import { Pagination } from "@infisical/cipher/ui/pagination";
import { RowLink } from "@infisical/cipher/ui/row-link";
import { StatusText } from "@infisical/cipher/ui/text";
import { Tooltip } from "@infisical/cipher/ui/tooltip";
import { useNavigate, useSearch } from "@tanstack/react-router";

import {
  ProjectPermissionSecretSyncActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { SECRET_SYNC_MAP } from "@app/helpers/secretSyncs";
import { SecretSync, SecretSyncStatus } from "@app/hooks/api/secretSyncs/enums";
import type { TCreateSecretSyncDTO, TSecretSync } from "@app/hooks/api/secretSyncs/types";
import { ProviderIcon } from "@app/pages/v4/components/provider-icon";

import { useProjectPermission } from "../../../access/permissions";
import { failed, toast } from "../../../access/toast";
import { AccessRestricted, RESTRICTED, type Sort } from "../../../access/ui";
import { useV4Adapter } from "../../../data/adapters";
import { useGo, v4Path } from "../../../links";
import {
  CreateSecretSyncSheet,
  SYNC_DRAFT_STORAGE_KEY
} from "../../OverviewPage/secrets/secret-sync/create-secret-sync-sheet";
import type { LocalSecretSync } from "../../OverviewPage/secrets/secret-sync/sync-model";
import {
  destinationNameOf,
  destinationTextOf,
  sourcePathOf,
  SYNC_DOCS,
  SYNC_STATE,
  syncHref,
  syncsHref,
  syncStateOf
} from "./model";
import {
  AutoSyncOff,
  SyncDialog,
  type SyncDialogKind,
  SyncJobs,
  SyncMenuItems,
  SyncStatus,
  useSyncActions
} from "./parts";

const route = v4Path("/organizations/$orgId/projects/secret-management/$projectId/integrations/");
const listPath = v4Path("/organizations/$orgId/projects/secret-management/$projectId/integrations");

const STATUS_FILTERS = [
  { value: SecretSyncStatus.Running, label: "Syncing" },
  { value: SecretSyncStatus.Succeeded, label: "Synced" },
  { value: SecretSyncStatus.Failed, label: "Failed to sync" }
];

const statusMatches = (sync: TSecretSync, values: string[]) =>
  !values.length ||
  values.some(
    (value) =>
      sync.syncStatus === value ||
      (value === SecretSyncStatus.Running && sync.syncStatus === SecretSyncStatus.Pending)
  );

const toLocal = (sync: TSecretSync): LocalSecretSync => ({
  id: sync.id,
  name: sync.name,
  destination: sync.destination,
  project: sync.projectId,
  environment: sync.environment?.slug ?? "",
  path: sync.folder?.path ?? "/",
  status: sync.syncStatus,
  autoSync: sync.isAutoSyncEnabled,
  connectionId: sync.connection.id,
  connectionName: sync.connection.name,
  destinationConfig: sync.destinationConfig as Record<string, unknown>,
  syncOptions: sync.syncOptions as Record<string, unknown>
});

export const SecretSyncsTab = ({
  orgId,
  projectId,
  environments
}: {
  orgId: string;
  projectId: string;
  environments: readonly { id: string; name: string; slug: string }[];
}) => {
  const adapter = useV4Adapter("secrets");
  const go = useGo();
  const navigate = useNavigate();
  const { addSync, connectionId, connectionName, ...search } = useSearch({ from: route });
  const { permission, isPending: permissionPending } = useProjectPermission(projectId);
  const {
    data: syncs = [],
    isPending,
    error
  } = adapter.useSecretSyncs(projectId, { refetchInterval: 30_000 });
  const createSync = adapter.useCreateSecretSync();
  const actions = useSyncActions(projectId);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<FilterBarFilter[]>([]);
  const [sort, setSort] = useState<Sort>({ columnId: "name", direction: "asc" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [creating, setCreating] = useState<{ destination?: SecretSync; draft?: FieldValues }>();
  const [dialog, setDialog] = useState<{ kind: SyncDialogKind; sync: TSecretSync }>();

  useEffect(() => {
    if (!addSync) return;
    setCreating({ destination: addSync as SecretSync });
    navigate({ to: listPath, params: { orgId, projectId }, search, replace: true });
  }, [addSync]);

  useEffect(() => {
    if (!connectionId || !connectionName) return;
    navigate({ to: listPath, params: { orgId, projectId }, search, replace: true });
    const stored = sessionStorage.getItem(SYNC_DRAFT_STORAGE_KEY);
    sessionStorage.removeItem(SYNC_DRAFT_STORAGE_KEY);
    if (!stored) return;
    let draft: FieldValues;
    try {
      draft = JSON.parse(stored) as FieldValues;
    } catch {
      return;
    }
    setCreating({ draft: { ...draft, connection: { id: connectionId, name: connectionName } } });
  }, [connectionId, connectionName]);

  const picked = (field: string) => filters.find((filter) => filter.field === field)?.values ?? [];
  const statusFilter = picked("status");
  const destinationFilter = picked("destination");
  const environmentFilter = picked("environment");
  const needle = query.trim().toLowerCase();
  const filtered = syncs
    .filter((sync) => {
      if (!statusMatches(sync, statusFilter)) return false;
      if (destinationFilter.length && !destinationFilter.includes(sync.destination)) return false;
      if (
        environmentFilter.length &&
        sync.environment?.id &&
        !environmentFilter.includes(sync.environment.id)
      )
        return false;
      const { primaryText, secondaryText } = destinationTextOf(sync);
      return [
        destinationNameOf(sync.destination),
        sync.name,
        sync.folder?.path,
        sync.environment?.name,
        sync.connection.name,
        primaryText,
        secondaryText
      ].some((value) => value?.toLowerCase().includes(needle));
    })
    .sort((a, b) => {
      const order = (() => {
        switch (sort.columnId) {
          case "environment":
            return (a.environment?.name ?? "").localeCompare(b.environment?.name ?? "");
          case "source":
            return (a.folder?.path ?? "").toLowerCase().localeCompare(b.folder?.path ?? "");
          case "destination":
            return destinationTextOf(a)
              .primaryText.toLowerCase()
              .localeCompare(destinationTextOf(b).primaryText.toLowerCase());
          case "status":
            return SYNC_STATE[syncStateOf(a)].order - SYNC_STATE[syncStateOf(b)].order;
          default:
            return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
        }
      })();
      return sort.direction === "asc" ? order : -order;
    });

  if (
    !permissionPending &&
    !permission.can(ProjectPermissionSecretSyncActions.Read, ProjectPermissionSub.SecretSyncs)
  )
    return <AccessRestricted requirement="read secret syncs" />;

  const canCreate =
    permissionPending ||
    permission.can(ProjectPermissionSecretSyncActions.Create, ProjectPermissionSub.SecretSyncs);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pageCount);
  const isFiltered = Boolean(needle) || filters.some((filter) => filter.values.length > 0);

  let empty = (
    <EmptyState size="sm" media="bare" icon="sync" title="This project has no secret syncs" />
  );
  if (error)
    empty = (
      <EmptyState
        size="sm"
        media="bare"
        icon="alert-c"
        title="Couldn't load secret syncs"
        description={error instanceof Error ? error.message : undefined}
      />
    );
  else if (isFiltered && syncs.length)
    empty = (
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

  const columns: DataTableColumn<TSecretSync>[] = [
    {
      id: "name",
      header: "Name",
      primary: true,
      sortable: true,
      width: 260,
      text: (sync) => sync.name,
      render: (sync) => {
        const { image, name } = SECRET_SYNC_MAP[sync.destination];
        return (
          <Inline gap={8} align="center" wrap={false}>
            <ProviderIcon icon={image} alt={name} size="sm" />
            <RowLink link={go.link(syncHref(orgId, projectId, sync))}>{sync.name}</RowLink>
            {sync.description && (
              <Tooltip content={sync.description}>
                <span data-row-interactive aria-label="Description">
                  <Icon name="info" size="var(--cipher-size-icon-xs)" />
                </span>
              </Tooltip>
            )}
          </Inline>
        );
      }
    },
    {
      id: "environment",
      header: "Source environment",
      sortable: true,
      width: 170,
      text: (sync) => sync.environment?.name ?? "-",
      render: (sync) => sync.environment?.name ?? "-"
    },
    {
      id: "source",
      header: "Source path",
      sortable: true,
      mono: true,
      width: 200,
      text: (sync) => sourcePathOf(sync) ?? "",
      render: (sync) => {
        const path = sourcePathOf(sync);
        if (!path || !sync.environment)
          return (
            <Tooltip content="The source folder was deleted. Pick a new source or delete this sync.">
              <StatusText tone="bad" icon="alert" tabIndex={0} data-row-interactive>
                Source deleted
              </StatusText>
            </Tooltip>
          );
        return <MiddleTruncate mono text={path} />;
      }
    },
    {
      id: "destination",
      header: "Destination",
      sortable: true,
      grow: true,
      text: (sync) => destinationTextOf(sync).primaryText,
      render: (sync) => {
        const { primaryText, secondaryText } = destinationTextOf(sync);
        return (
          <Tooltip
            content={
              <Stack gap={4}>
                <span>{destinationNameOf(sync.destination)}</span>
                <span>{primaryText}</span>
                {secondaryText && <span>{secondaryText}</span>}
              </Stack>
            }
          >
            <span style={{ minWidth: 0 }} data-row-interactive>
              <MiddleTruncate text={primaryText} />
            </span>
          </Tooltip>
        );
      }
    },
    {
      id: "status",
      header: "Status",
      sortable: true,
      width: 220,
      text: (sync) => SYNC_STATE[syncStateOf(sync)].label,
      render: (sync) => (
        <Inline gap={12} align="center" wrap={false}>
          <span data-row-interactive>
            <SyncStatus sync={sync} />
          </span>
          {!sync.isAutoSyncEnabled && <AutoSyncOff />}
          <SyncJobs sync={sync} />
        </Inline>
      )
    }
  ];

  const presentDestinations = [...new Set(syncs.map((sync) => sync.destination))];

  return (
    <Stack gap={16}>
      <FilterBar
        label="Secret sync filters"
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
          },
          {
            key: "environment",
            label: "Environment",
            type: "multi-select",
            options: environments.map((environment) => ({
              value: environment.id,
              label: environment.name
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
            aria-label="Search secret syncs"
            placeholder="Search secret syncs..."
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
        }
        actions={
          <Inline gap={8} align="center" wrap={false}>
            <DocumentationLinkBadge href={SYNC_DOCS} />
            <Button
              icon="plus"
              disabledReason={canCreate ? undefined : RESTRICTED}
              onClick={() => setCreating({})}
            >
              Add sync
            </Button>
          </Inline>
        }
      />
      <DataTable
        label="Secret syncs"
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
          inline: [
            {
              label: "Trigger sync",
              icon: "sync",
              onSelect: actions.triggerSync,
              disabledReason: (sync) =>
                actions.blockFor(sync, ProjectPermissionSecretSyncActions.SyncSecrets)
            }
          ],
          menuLabel: "Sync options",
          renderMenu: (sync) => (
            <SyncMenuItems
              sync={sync}
              actions={actions}
              onOpen={(kind) => setDialog({ kind, sync })}
            />
          )
        }}
        empty={empty}
        pagination={
          filtered.length > 0 ? (
            <Pagination
              label="Secret sync pages"
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
      <SyncDialog
        dialog={dialog}
        projectId={projectId}
        actions={actions}
        onClose={() => setDialog(undefined)}
      />
      <CreateSecretSyncSheet
        open={Boolean(creating)}
        destination={creating?.destination}
        draft={creating?.draft}
        returnTo={syncsHref(orgId, projectId)}
        onOpenChange={(open) => !open && setCreating(undefined)}
        scope={{
          project: projectId,
          path: "/",
          environments: environments.map((environment) => ({
            value: environment.slug,
            label: environment.name
          })),
          visibleEnvironments: environments.map((environment) => ({
            value: environment.slug,
            label: environment.name
          }))
        }}
        syncs={syncs.map(toLocal)}
        onCreate={(sync, feedback) =>
          createSync
            .mutateAsync({
              projectId,
              destination: sync.destination as SecretSync,
              name: sync.name,
              description: sync.description,
              connectionId: sync.connectionId ?? "",
              environment: sync.environment,
              secretPath: sync.path,
              isAutoSyncEnabled: sync.autoSync,
              destinationConfig: sync.destinationConfig,
              syncOptions: sync.syncOptions
            } as TCreateSecretSyncDTO)
            .then(
              () => {
                setCreating(undefined);
                toast({ tone: "ok", ...feedback });
              },
              (createError: unknown) => failed("Couldn't create the secret sync", createError)
            )
        }
        onToast={(tone, feedback) => toast({ tone, ...feedback })}
      />
    </Stack>
  );
};
