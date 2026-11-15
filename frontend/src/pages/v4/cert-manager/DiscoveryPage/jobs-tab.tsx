import { useState } from "react";
import { Button } from "@infisical/cipher/ui/button";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import { DropdownMenuItem, DropdownMenuSeparator } from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { Pagination } from "@infisical/cipher/ui/pagination";
import { RowLink } from "@infisical/cipher/ui/row-link";

import { CertificateDiscoveryUpgradeIntent } from "@app/components/license/UpgradeGate/upgrade-intents";
import { ProjectPermissionPkiDiscoveryActions } from "@app/context/ProjectPermissionContext/types";
import { PKI_DISCOVERY_TYPE_MAP } from "@app/helpers/pkiDiscovery";
import {
  PkiDiscoveryType,
  type TPkiDiscovery,
  WindowsCertificateStoreLabels
} from "@app/hooks/api/pkiDiscovery/types";
import { useDebounce } from "@app/hooks/useDebounce";

import { useOrgId } from "../../access/permissions";
import { failed } from "../../access/toast";
import { RESTRICTED } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";
import { useUpgradeGate } from "../../license";
import { orgHref, useGo } from "../../links";
import {
  BadgeList,
  DeleteDiscoveryDialog,
  DiscoveryStatusBadge,
  DiscoveryTypeIcon,
  isScanInFlight,
  parsePorts,
  timestamp,
  useDiscoveryAccess
} from "./discovery-shared";
import { DiscoveryJobSheet } from "./job-sheet";

const scopeItems = (discovery: TPkiDiscovery) => {
  if (discovery.discoveryType === PkiDiscoveryType.WindowsServer)
    return (discovery.targetConfig.certificateStores ?? []).map(
      (store) => WindowsCertificateStoreLabels[store] ?? store
    );
  if (discovery.discoveryType === PkiDiscoveryType.LinuxServer)
    return discovery.targetConfig.searchFolderPaths ?? [];
  const ports = parsePorts(discovery.targetConfig.ports);
  return ports.length ? ports : ["443"];
};

const targetItems = (discovery: TPkiDiscovery) => {
  if (discovery.discoveryType !== PkiDiscoveryType.Network)
    return (discovery.connections ?? []).map((connection) => connection.name);
  return [...(discovery.targetConfig.domains ?? []), ...(discovery.targetConfig.ipRanges ?? [])];
};

export const JobsTab = ({ orgId, projectId }: { orgId: string; projectId: string }) => {
  const go = useGo();
  const adapter = useV4Adapter("pkiDiscovery");
  const access = useDiscoveryAccess(projectId);
  const { data: subscription } = adapter.useSubscription(useOrgId());
  const { openUpgradeGate, upgradeGate } = useUpgradeGate();
  const triggerScan = adapter.useTriggerScan();
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 300);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TPkiDiscovery>();
  const [deleting, setDeleting] = useState<TPkiDiscovery>();
  const { data, isPending, error } = adapter.useDiscoveries({
    projectId,
    offset: (page - 1) * pageSize,
    limit: pageSize,
    search: debouncedSearch || undefined
  });
  const rows = data?.discoveries ?? [];
  const total = data?.totalCount ?? 0;
  const can = (action: ProjectPermissionPkiDiscoveryActions) =>
    access.discovery(action) ? undefined : RESTRICTED;

  const startCreate = () => {
    if (!subscription?.pkiDiscovery) {
      openUpgradeGate({
        intent: CertificateDiscoveryUpgradeIntent,
        paywallKey: "cert-manager.discovery-jobs"
      });
      return;
    }
    setCreating(true);
  };

  const runScan = async (discovery: TPkiDiscovery) => {
    try {
      await triggerScan.mutateAsync({ discoveryId: discovery.id, projectId });
    } catch (scanError) {
      failed(`Couldn't start a scan for ${discovery.name}`, scanError);
    }
  };

  const href = (discovery: TPkiDiscovery) =>
    orgHref(orgId, `/cert-manager/discovery/${discovery.id}`);

  const columns: DataTableColumn<TPkiDiscovery>[] = [
    {
      id: "name",
      header: "Name",
      primary: true,
      grow: true,
      minWidth: 200,
      text: (discovery) => discovery.name,
      secondary: (discovery) => discovery.description || undefined,
      render: (discovery) => (
        <RowLink link={go.link(href(discovery))} title={discovery.name}>
          {discovery.name}
        </RowLink>
      )
    },
    {
      id: "type",
      header: "Type",
      width: 160,
      render: (discovery) => (
        <Inline gap={8} align="center" wrap={false}>
          <DiscoveryTypeIcon type={discovery.discoveryType} />
          <span>{PKI_DISCOVERY_TYPE_MAP[discovery.discoveryType]?.name}</span>
        </Inline>
      )
    },
    {
      id: "target",
      header: "Target",
      width: 240,
      render: (discovery) => <BadgeList items={targetItems(discovery)} max={1} mono />
    },
    {
      id: "scope",
      header: "Scope",
      width: 200,
      render: (discovery) => <BadgeList items={scopeItems(discovery)} max={2} mono />
    },
    {
      id: "status",
      header: "Status",
      width: 120,
      render: (discovery) => <DiscoveryStatusBadge discovery={discovery} />
    },
    {
      id: "scanned",
      header: "Last scan",
      width: 160,
      render: (discovery) =>
        discovery.lastScannedAt ? timestamp(discovery.lastScannedAt) : "Never"
    }
  ];

  let empty = (
    <EmptyState
      size="sm"
      icon="radar"
      title="No discovery jobs yet"
      description="Add a job to scan your network or your servers for certificates."
      actions={
        <Button
          variant="outline"
          icon="plus"
          disabledReason={can(ProjectPermissionPkiDiscoveryActions.Create)}
          onClick={startCreate}
        >
          Add job
        </Button>
      }
    />
  );
  if (error)
    empty = (
      <EmptyState
        size="sm"
        icon="alert-c"
        title="Couldn't load discovery jobs"
        description={error instanceof Error ? error.message : undefined}
      />
    );
  else if (debouncedSearch)
    empty = (
      <EmptyState
        size="sm"
        icon="search"
        title="No discovery jobs match this search"
        actions={
          <Button variant="link" onClick={() => setSearch("")}>
            Clear search
          </Button>
        }
      />
    );

  return (
    <Stack gap={16}>
      <Inline gap={12} align="center" wrap={false}>
        <Input
          icon="search"
          aria-label="Search discovery jobs"
          placeholder="Search by name or description"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
        <Button
          variant="accent"
          icon="plus"
          disabledReason={can(ProjectPermissionPkiDiscoveryActions.Create)}
          onClick={startCreate}
        >
          Add job
        </Button>
      </Inline>
      <DataTable
        label="Discovery jobs"
        rows={rows}
        columns={columns}
        loading={isPending && !error}
        getRowId={(discovery) => discovery.id}
        rowLabel={(discovery) => discovery.name}
        isRowMuted={(discovery) => !discovery.isActive}
        empty={empty}
        persistentStatus={total ? `${total} ${total === 1 ? "job" : "jobs"}` : undefined}
        rowActions={{
          inline: [
            {
              label: "Run scan",
              icon: "sync",
              disabledReason: (discovery) => {
                const blocked = can(ProjectPermissionPkiDiscoveryActions.RunScan);
                if (blocked) return blocked;
                if (!discovery.isActive) return "This job is paused";
                if (isScanInFlight(discovery.lastScanStatus)) return "A scan is already running";
                return undefined;
              },
              onSelect: runScan
            }
          ],
          renderMenu: (discovery) => (
            <>
              <DropdownMenuItem
                disabled={Boolean(can(ProjectPermissionPkiDiscoveryActions.Edit))}
                description={can(ProjectPermissionPkiDiscoveryActions.Edit)}
                onSelect={() => setEditing(discovery)}
              >
                <Icon name="pencil" />
                Edit job
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                disabled={Boolean(can(ProjectPermissionPkiDiscoveryActions.Delete))}
                description={can(ProjectPermissionPkiDiscoveryActions.Delete)}
                onSelect={() => setDeleting(discovery)}
              >
                <Icon name="trash" />
                Delete job
              </DropdownMenuItem>
            </>
          )
        }}
        pagination={
          total > pageSize ? (
            <Pagination
              label="Discovery job pages"
              variant="compact"
              page={page}
              onPageChange={setPage}
              total={total}
              pageSize={pageSize}
              pageSizeOptions={[25, 50, 100]}
              onPageSizeChange={(next) => {
                setPageSize(next);
                setPage(1);
              }}
            />
          ) : undefined
        }
      />
      <DiscoveryJobSheet open={creating} projectId={projectId} onClose={() => setCreating(false)} />
      <DiscoveryJobSheet
        open={Boolean(editing)}
        projectId={projectId}
        discovery={editing}
        onClose={() => setEditing(undefined)}
      />
      <DeleteDiscoveryDialog discovery={deleting} onClose={() => setDeleting(undefined)} />
      {upgradeGate}
    </Stack>
  );
};
