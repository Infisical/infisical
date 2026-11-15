import { useState } from "react";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { DetailLayout, Stack } from "@infisical/cipher/ui/layout";
import { DataList } from "@infisical/cipher/ui/list";
import { Loader } from "@infisical/cipher/ui/loader";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { Pagination } from "@infisical/cipher/ui/pagination";
import { RowLink } from "@infisical/cipher/ui/row-link";
import { Tooltip, TooltipProvider } from "@infisical/cipher/ui/tooltip";
import { useParams } from "@tanstack/react-router";

import { PageTitle } from "@app/components/PageTitle";
import { ProjectPermissionPkiDiscoveryActions } from "@app/context/ProjectPermissionContext/types";
import { PKI_DISCOVERY_TYPE_MAP } from "@app/helpers/pkiDiscovery";
import {
  PkiDiscoveryType,
  type TPkiDiscovery,
  type TPkiDiscoveryScan,
  type TPkiInstallation,
  WindowsCertificateStoreLabels
} from "@app/hooks/api/pkiDiscovery/types";

import { failed, saved } from "../../access/toast";
import { AccessRestricted, Muted, RESTRICTED } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";
import { orgHref, useGo, v4Path } from "../../links";
import { useCertManagerProjectId } from "../components/certificate";
import {
  BadgeList,
  DeleteDiscoveryDialog,
  DiscoveryStatusBadge,
  installationName,
  isScanInFlight,
  parsePorts,
  SCAN_IN_FLIGHT_POLL_MS,
  ScanStatusBadge,
  timestamp,
  useDiscoveryAccess
} from "../DiscoveryPage/discovery-shared";
import { DiscoveryJobSheet } from "../DiscoveryPage/job-sheet";

const routeId = v4Path("/organizations/$orgId/cert-manager/discovery/$discoveryId");

const enabled = (value?: boolean) => (
  <Badge tone={value ? "ok" : "outline"} dot>
    {value ? "Enabled" : "Disabled"}
  </Badge>
);

const targetItems = (discovery: TPkiDiscovery) => {
  const { targetConfig } = discovery;
  const connectionNames = new Map((discovery.connections ?? []).map((c) => [c.id, c.name]));
  const connections = (targetConfig.connectionIds ?? []).map(
    (id) => connectionNames.get(id) ?? "Deleted connection"
  );
  if (discovery.discoveryType === PkiDiscoveryType.LinuxServer)
    return [
      ["SSH connections", <BadgeList key="hosts" items={connections} max={3} />],
      [
        "Search folders",
        <BadgeList key="search" items={targetConfig.searchFolderPaths ?? []} max={3} mono />
      ],
      ...(targetConfig.skipFolderPaths?.length
        ? [
            [
              "Skip folders",
              <BadgeList key="skip" items={targetConfig.skipFolderPaths} max={3} mono />
            ] as const
          ]
        : []),
      ["Folder depth", String(targetConfig.maxFolderDepth ?? "-")],
      ["Include trust stores and CA bundles", enabled(targetConfig.importStandaloneCaCertificates)]
    ] as const;
  if (discovery.discoveryType === PkiDiscoveryType.WindowsServer)
    return [
      ["Windows (WinRM) connections", <BadgeList key="hosts" items={connections} max={3} />],
      [
        "Certificate stores",
        <BadgeList
          key="stores"
          items={(targetConfig.certificateStores ?? []).map(
            (store) => WindowsCertificateStoreLabels[store] ?? store
          )}
          max={2}
        />
      ],
      ["Include CA certificates", enabled(targetConfig.importStandaloneCaCertificates)]
    ] as const;
  const ports = parsePorts(targetConfig.ports);
  return [
    ...(targetConfig.domains?.length
      ? [
          [
            "Domains",
            <BadgeList key="domains" items={targetConfig.domains} max={3} mono />
          ] as const
        ]
      : []),
    ...(targetConfig.ipRanges?.length
      ? [["IP ranges", <BadgeList key="ips" items={targetConfig.ipRanges} max={3} mono />] as const]
      : []),
    ["Ports", <BadgeList key="ports" items={ports.length ? ports : ["443"]} max={5} mono />]
  ] as const;
};

const ScanRuns = ({
  discovery,
  projectId,
  isScanRunning
}: {
  discovery: TPkiDiscovery;
  projectId: string;
  isScanRunning: boolean;
}) => {
  const adapter = useV4Adapter("pkiDiscovery");
  const access = useDiscoveryAccess(projectId);
  const triggerScan = adapter.useTriggerScan();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const { data, isPending } = adapter.useScanHistory(
    { discoveryId: discovery.id, offset: (page - 1) * pageSize, limit: pageSize },
    { refetchInterval: isScanRunning ? SCAN_IN_FLIGHT_POLL_MS : false }
  );
  const scans = data?.scans ?? [];
  const total = data?.totalCount ?? 0;
  let blocked: string | undefined;
  if (!access.discovery(ProjectPermissionPkiDiscoveryActions.RunScan)) blocked = RESTRICTED;
  else if (!discovery.isActive) blocked = "This job is paused";
  else if (isScanRunning) blocked = "A scan is already running";

  const runScan = async () => {
    try {
      await triggerScan.mutateAsync({ discoveryId: discovery.id, projectId });
    } catch (error) {
      failed(`Couldn't start a scan for ${discovery.name}`, error);
    }
  };

  const columns: DataTableColumn<TPkiDiscoveryScan>[] = [
    {
      id: "started",
      header: "Started",
      primary: true,
      width: 168,
      render: (scan) => timestamp(scan.startedAt)
    },
    {
      id: "status",
      header: "Status",
      width: 120,
      render: (scan) => <ScanStatusBadge status={scan.status} />
    },
    {
      id: "targets",
      header: "Targets",
      width: 88,
      align: "end",
      render: (scan) => scan.targetsScannedCount
    },
    {
      id: "certs",
      header: "Certs found",
      width: 104,
      align: "end",
      render: (scan) => scan.certificatesFoundCount
    },
    {
      id: "installations",
      header: "Installations",
      width: 112,
      align: "end",
      render: (scan) => scan.installationsFoundCount
    },
    {
      id: "duration",
      header: "Duration",
      width: 96,
      align: "end",
      render: (scan) =>
        scan.completedAt
          ? `${((new Date(scan.completedAt).getTime() - new Date(scan.startedAt).getTime()) / 1000).toFixed(1)}s`
          : "-"
    },
    {
      id: "message",
      header: "Message",
      grow: true,
      minWidth: 160,
      render: (scan) =>
        scan.errorMessage ? (
          <Tooltip content={scan.errorMessage}>
            <span>{scan.errorMessage}</span>
          </Tooltip>
        ) : (
          <Muted>-</Muted>
        )
    }
  ];

  return (
    <Card
      variant="framed"
      flush
      title="Scan runs"
      action={
        <Button
          variant="outline"
          icon="sync"
          loading={triggerScan.isPending}
          disabledReason={blocked}
          onClick={runScan}
        >
          Run scan
        </Button>
      }
    >
      <DataTable
        label="Scan runs"
        rows={scans}
        columns={columns}
        loading={isPending}
        loadingRows={3}
        getRowId={(scan) => scan.id}
        rowLabel={(scan) => timestamp(scan.startedAt)}
        empty={
          <EmptyState
            size="sm"
            icon="history"
            title="No scans yet"
            description="Run a scan to see its results here."
          />
        }
        pagination={
          total > pageSize ? (
            <Pagination
              label="Scan run pages"
              variant="compact"
              page={page}
              onPageChange={setPage}
              total={total}
              pageSize={pageSize}
              pageSizeOptions={[10, 25, 50]}
              onPageSizeChange={(next) => {
                setPageSize(next);
                setPage(1);
              }}
            />
          ) : undefined
        }
      />
    </Card>
  );
};

const FoundInstallations = ({
  orgId,
  discoveryId,
  projectId,
  isScanRunning
}: {
  orgId: string;
  discoveryId: string;
  projectId: string;
  isScanRunning: boolean;
}) => {
  const go = useGo();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const { data, isPending } = useV4Adapter("pkiDiscovery").useInstallations(
    { projectId, discoveryId, offset: (page - 1) * pageSize, limit: pageSize },
    { refetchInterval: isScanRunning ? SCAN_IN_FLIGHT_POLL_MS : false }
  );
  const rows = data?.installations ?? [];
  const total = data?.totalCount ?? 0;
  const columns: DataTableColumn<TPkiInstallation>[] = [
    {
      id: "name",
      header: "Name",
      primary: true,
      grow: true,
      minWidth: 200,
      text: (installation) => installationName(installation),
      render: (installation) => (
        <RowLink
          link={go.link(orgHref(orgId, `/cert-manager/discovery/installations/${installation.id}`))}
          title={installationName(installation)}
        >
          {installationName(installation)}
        </RowLink>
      )
    },
    {
      id: "certificate",
      header: "Certificate",
      width: 200,
      text: (installation) => installation.primaryCertName || "N/A",
      render: (installation) => installation.primaryCertName || "N/A"
    },
    {
      id: "gateway",
      header: "Gateway",
      width: 140,
      render: (installation) => installation.locationDetails.gatewayName || "N/A"
    },
    {
      id: "seen",
      header: "Last seen",
      width: 160,
      render: (installation) => timestamp(installation.lastSeenAt)
    }
  ];
  return (
    <Card variant="framed" flush title="Installations">
      <DataTable
        label="Installations found by this job"
        rows={rows}
        columns={columns}
        loading={isPending}
        loadingRows={3}
        getRowId={(installation) => installation.id}
        rowLabel={(installation) => installationName(installation)}
        empty={
          <EmptyState
            size="sm"
            icon="server"
            title="No installations found"
            description="Run a scan to find certificate installations."
          />
        }
        pagination={
          total > pageSize ? (
            <Pagination
              label="Installation pages"
              variant="compact"
              page={page}
              onPageChange={setPage}
              total={total}
              pageSize={pageSize}
              pageSizeOptions={[10, 25, 50]}
              onPageSizeChange={(next) => {
                setPageSize(next);
                setPage(1);
              }}
            />
          ) : undefined
        }
      />
    </Card>
  );
};

const DiscoveryDetail = ({
  orgId,
  projectId,
  discovery
}: {
  orgId: string;
  projectId: string;
  discovery: TPkiDiscovery;
}) => {
  const go = useGo();
  const access = useDiscoveryAccess(projectId);
  const isScanRunning = isScanInFlight(discovery.lastScanStatus);
  useV4Adapter("pkiDiscovery").useRefreshAfterScan(discovery.id, projectId, isScanRunning);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const listHref = orgHref(orgId, "/cert-manager/discovery");
  const blocked = (action: ProjectPermissionPkiDiscoveryActions) =>
    access.discovery(action) ? undefined : RESTRICTED;

  return (
    <Stack gap={24}>
      <PageHeader
        breadcrumb={[{ label: "Discovery jobs", link: go.link(listHref) }]}
        title={discovery.name}
        description={discovery.description || undefined}
        badges={
          discovery.isAutoScanEnabled ? (
            <Badge tone="info" dot>
              Auto-scan
            </Badge>
          ) : undefined
        }
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button layout="trigger" variant="outline" icon="more">
                More
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() => {
                  navigator.clipboard?.writeText(discovery.id).catch(() => undefined);
                  saved("Discovery job ID copied");
                }}
              >
                <Icon name="copy" />
                Copy job ID
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={Boolean(blocked(ProjectPermissionPkiDiscoveryActions.Edit))}
                description={blocked(ProjectPermissionPkiDiscoveryActions.Edit)}
                onSelect={() => setEditing(true)}
              >
                <Icon name="pencil" />
                Edit job
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                disabled={Boolean(blocked(ProjectPermissionPkiDiscoveryActions.Delete))}
                description={blocked(ProjectPermissionPkiDiscoveryActions.Delete)}
                onSelect={() => setDeleting(true)}
              >
                <Icon name="trash" />
                Delete job
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />
      <DetailLayout
        asideLabel="Discovery job details"
        aside={
          <Stack gap={16}>
            <Card variant="framed" title="Details">
              <DataList
                variant="props"
                density="compact"
                items={[
                  [
                    "Type",
                    PKI_DISCOVERY_TYPE_MAP[discovery.discoveryType]?.name ?? discovery.discoveryType
                  ],
                  [
                    "Status",
                    <DiscoveryStatusBadge key="status" discovery={discovery} showWarnings={false} />
                  ],
                  ...(discovery.lastScanMessage
                    ? ([["Last scan result", discovery.lastScanMessage]] as const)
                    : []),
                  ...(discovery.gatewayName ? ([["Gateway", discovery.gatewayName]] as const) : []),
                  ...(discovery.gatewayPoolName
                    ? ([["Gateway pool", discovery.gatewayPoolName]] as const)
                    : []),
                  [
                    "Last scanned",
                    discovery.lastScannedAt ? timestamp(discovery.lastScannedAt) : "Never"
                  ],
                  ["Auto-scan", enabled(discovery.isAutoScanEnabled)],
                  ...(discovery.isAutoScanEnabled && discovery.scanIntervalDays
                    ? ([
                        [
                          "Scan interval",
                          `Every ${discovery.scanIntervalDays} day${discovery.scanIntervalDays > 1 ? "s" : ""}`
                        ]
                      ] as const)
                    : [])
                ]}
              />
            </Card>
            <Card variant="framed" title="Targets">
              <DataList variant="props" density="compact" items={targetItems(discovery)} />
            </Card>
          </Stack>
        }
      >
        <ScanRuns discovery={discovery} projectId={projectId} isScanRunning={isScanRunning} />
        <FoundInstallations
          orgId={orgId}
          discoveryId={discovery.id}
          projectId={projectId}
          isScanRunning={isScanRunning}
        />
      </DetailLayout>
      <DiscoveryJobSheet
        open={editing}
        projectId={projectId}
        discovery={discovery}
        onClose={() => setEditing(false)}
      />
      <DeleteDiscoveryDialog
        discovery={deleting ? discovery : undefined}
        onClose={() => setDeleting(false)}
        onDeleted={() => go(listHref)}
      />
    </Stack>
  );
};

const Page = () => {
  const { orgId, discoveryId } = useParams({ from: routeId });
  const { projectId, isPending: isResolving } = useCertManagerProjectId(orgId);
  const access = useDiscoveryAccess(projectId ?? "");
  const { data: discovery, isPending } = useV4Adapter("pkiDiscovery").useDiscovery(discoveryId);
  if (isResolving || access.isPending || isPending)
    return <Loader size="page" label="Loading discovery job" />;
  if (!access.discovery(ProjectPermissionPkiDiscoveryActions.Read))
    return <AccessRestricted requirement="Read discovery jobs" />;
  if (!discovery || !projectId)
    return (
      <EmptyState
        icon="radar"
        title="Discovery job not found"
        description="It may have been deleted, or you may not have access to it."
        actions={
          <Button variant="outline" asChild>
            <a href={orgHref(orgId, "/cert-manager/discovery")}>Back to discovery jobs</a>
          </Button>
        }
      />
    );
  return <DiscoveryDetail orgId={orgId} projectId={projectId} discovery={discovery} />;
};

export const DiscoveryDetailsByIDPage = () => (
  <TooltipProvider>
    <PageTitle title="Discovery Job Details" />
    <Page />
  </TooltipProvider>
);
