import { useEffect, useMemo, useState } from "react";

import { FilterBar, type FilterBarFilter } from "@app/components/v4/patterns/filter-bar";
import { Alert } from "@app/components/v4/ui/alert";
import { Button } from "@app/components/v4/ui/button";
import { DataTable, type DataTableColumn } from "@app/components/v4/ui/data-table";
import { DropdownMenuItem } from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { MiddleTruncate } from "@app/components/v4/ui/middle-truncate";
import { Pagination } from "@app/components/v4/ui/pagination";
import { ProviderIcon } from "@app/components/v4/ui/provider-icon";
import { RowLink } from "@app/components/v4/ui/row-link";
import { Tooltip } from "@app/components/v4/ui/tooltip";
import { NATIVE_INTEGRATION_DEPRECATION_DATE } from "@app/const/nativeIntegrationDeprecation";
import {
  ProjectPermissionActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import type { TIntegration } from "@app/hooks/api/integrations/types";

import { useProjectPermission } from "../../access/permissions";
import { AccessRestricted, RESTRICTED, type Sort } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";
import { useGo } from "../../links";
import {
  destinationFacts,
  destinationOf,
  integrationHref,
  integrationName,
  integrationsHref,
  MIGRATION_DOCS,
  SECRET_SYNCS_TAB,
  SYNC_STATE_LABEL,
  type SyncState,
  syncStateOf
} from "./native-model";
import {
  CreationBlockedDialog,
  DeleteNativeIntegrationDialog,
  SyncStatus,
  useSyncNow
} from "./native-parts";

const STATUS_ORDER: Record<SyncState, number> = { failed: 0, synced: 1, pending: 2 };

export const RetirementNotice = ({ orgId, projectId }: { orgId: string; projectId: string }) => {
  const go = useGo();
  return (
    <Alert
      tone="warn"
      title="Migrate to secret syncs"
      actions={
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={() => go(integrationsHref(orgId, projectId, SECRET_SYNCS_TAB))}
          >
            Go to secret syncs
          </Button>
          <Button variant="link" asChild>
            <a href={MIGRATION_DOCS} target="_blank" rel="noreferrer">
              Migration guide
            </a>
          </Button>
        </>
      }
    >
      Native integrations are being retired on {NATIVE_INTEGRATION_DEPRECATION_DATE}. Existing
      integrations keep syncing until then; secret syncs support the same services.
    </Alert>
  );
};

export const NativeIntegrationsTab = ({
  orgId,
  projectId,
  environments
}: {
  orgId: string;
  projectId: string;
  environments: readonly { id: string; name: string; slug: string }[];
}) => {
  const adapter = useV4Adapter("projectIntegrations");
  const go = useGo();
  const { permission, isPending: permissionPending } = useProjectPermission(projectId);
  const { data: integrations = [], isPending, error } = adapter.useNativeIntegrations(projectId);
  const { data: options } = adapter.useNativeIntegrationOptions();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<FilterBarFilter[]>([]);
  const [sort, setSort] = useState<Sort>({ columnId: "integration", direction: "asc" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [deleting, setDeleting] = useState<TIntegration>();
  const [blocked, setBlocked] = useState(false);
  const nameOf = (integration: TIntegration) => integrationName(integration.integration, options);
  const syncNow = useSyncNow(projectId, nameOf);

  const hasFailure = integrations.some((integration) => integration.isSynced === false);
  useEffect(() => {
    if (hasFailure) setSort({ columnId: "status", direction: "asc" });
  }, [hasFailure]);

  const environmentById = useMemo(
    () => new Map(environments.map((environment) => [environment.id, environment])),
    [environments]
  );
  const environmentName = (integration: TIntegration) =>
    environmentById.get(integration.envId)?.name ?? "-";

  const picked = (field: string) => filters.find((filter) => filter.field === field)?.values ?? [];
  const statusFilter = picked("status");
  const appFilter = picked("integration");
  const environmentFilter = picked("environment");
  const needle = query.trim().toLowerCase();
  const filtered = integrations
    .filter(
      (integration) =>
        (!statusFilter.length || statusFilter.includes(syncStateOf(integration))) &&
        (!appFilter.length || appFilter.includes(integration.integration)) &&
        (!environmentFilter.length || environmentFilter.includes(integration.envId)) &&
        [
          nameOf(integration),
          integration.secretPath,
          destinationOf(integration),
          environmentName(integration)
        ].some((value) => value.toLowerCase().includes(needle))
    )
    .sort((a, b) => {
      const order = (() => {
        switch (sort.columnId) {
          case "path":
            return a.secretPath.localeCompare(b.secretPath);
          case "environment":
            return environmentName(a).localeCompare(environmentName(b));
          case "destination":
            return destinationOf(a).toLowerCase().localeCompare(destinationOf(b).toLowerCase());
          case "status":
            return STATUS_ORDER[syncStateOf(a)] - STATUS_ORDER[syncStateOf(b)];
          default:
            return nameOf(a).toLowerCase().localeCompare(nameOf(b).toLowerCase());
        }
      })();
      return sort.direction === "asc" ? order : -order;
    });

  if (
    !permissionPending &&
    !permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.Integrations)
  )
    return <AccessRestricted requirement="read integrations" />;

  const canDelete = permission.can(
    ProjectPermissionActions.Delete,
    ProjectPermissionSub.Integrations
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pageCount);
  const isFiltered = Boolean(needle) || filters.some((filter) => filter.values.length > 0);

  let empty = (
    <EmptyState
      size="sm"
      media="bare"
      icon="sync"
      title="This project has no native integrations"
    />
  );
  if (error)
    empty = (
      <EmptyState
        size="sm"
        media="bare"
        icon="alert-c"
        title="Couldn't load native integrations"
        description={error instanceof Error ? error.message : undefined}
      />
    );
  else if (isFiltered && integrations.length)
    empty = (
      <EmptyState
        size="sm"
        media="bare"
        icon="search"
        title="No integrations match your filters"
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

  const columns: DataTableColumn<TIntegration>[] = [
    {
      id: "integration",
      header: "Integration",
      primary: true,
      sortable: true,
      width: 240,
      text: nameOf,
      render: (integration) => {
        const option = options?.find((entry) => entry.slug === integration.integration);
        return (
          <Inline gap={8} align="center" wrap={false}>
            {option && <ProviderIcon icon={option.image} alt="" size="sm" />}
            <RowLink link={go.link(integrationHref(orgId, projectId, integration.id))}>
              {nameOf(integration)}
            </RowLink>
          </Inline>
        );
      }
    },
    {
      id: "path",
      header: "Source path",
      sortable: true,
      mono: true,
      width: 200,
      text: (integration) => integration.secretPath,
      render: (integration) => <MiddleTruncate mono text={integration.secretPath} />
    },
    {
      id: "environment",
      header: "Source environment",
      sortable: true,
      width: 180,
      text: environmentName,
      render: environmentName
    },
    {
      id: "destination",
      header: "Destination",
      sortable: true,
      grow: true,
      text: destinationOf,
      render: (integration) => (
        <Tooltip
          content={
            <Stack gap={4}>
              {destinationFacts(integration).map(([label, value]) => (
                <span key={label}>
                  {label}: {value}
                </span>
              ))}
            </Stack>
          }
        >
          <span style={{ minWidth: 0 }}>
            <MiddleTruncate text={destinationOf(integration)} />
          </span>
        </Tooltip>
      )
    },
    {
      id: "status",
      header: "Status",
      sortable: true,
      width: 150,
      text: (integration) => SYNC_STATE_LABEL[syncStateOf(integration)],
      render: (integration) => <SyncStatus integration={integration} />
    }
  ];

  return (
    <Stack gap={16}>
      <RetirementNotice orgId={orgId} projectId={projectId} />
      <FilterBar
        label="Native integration filters"
        fields={[
          {
            key: "status",
            label: "Status",
            type: "multi-select",
            options: (["synced", "failed", "pending"] as const).map((state) => ({
              value: state,
              label: SYNC_STATE_LABEL[state]
            }))
          },
          {
            key: "integration",
            label: "Integration",
            type: "multi-select",
            options: [...new Set(integrations.map((entry) => entry.integration))].map((slug) => ({
              value: slug,
              label: integrationName(slug, options)
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
            aria-label="Search native integrations"
            placeholder="Search native integrations..."
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
        }
        actions={
          <Button variant="outline" icon="plus" onClick={() => setBlocked(true)}>
            Add integration
          </Button>
        }
      />
      <DataTable
        label="Native integrations"
        rows={filtered.slice((current - 1) * pageSize, current * pageSize)}
        columns={columns}
        loading={isPending && !error}
        loadingRows={3}
        getRowId={(integration) => integration.id}
        rowLabel={(integration) => `${nameOf(integration)} integration`}
        sort={sort}
        onSortChange={(next) => {
          setSort(next);
          setPage(1);
        }}
        rowActions={{
          inline: [{ label: "Sync now", icon: "sync", onSelect: syncNow }],
          menuLabel: "Integration options",
          renderMenu: (integration) => (
            <DropdownMenuItem
              variant="destructive"
              disabled={!canDelete}
              description={canDelete ? undefined : RESTRICTED}
              onSelect={() => setDeleting(integration)}
            >
              <Icon name="trash" />
              Delete integration
            </DropdownMenuItem>
          )
        }}
        empty={empty}
        pagination={
          filtered.length > 0 ? (
            <Pagination
              label="Native integration pages"
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
      {deleting && (
        <DeleteNativeIntegrationDialog
          integration={deleting}
          name={nameOf(deleting)}
          projectId={projectId}
          onClose={() => setDeleting(undefined)}
        />
      )}
      {blocked && (
        <CreationBlockedDialog
          orgId={orgId}
          projectId={projectId}
          onClose={() => setBlocked(false)}
        />
      )}
    </Stack>
  );
};
