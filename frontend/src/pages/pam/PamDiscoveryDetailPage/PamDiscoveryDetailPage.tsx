import { useState } from "react";
import { Helmet } from "react-helmet";
import { faChevronLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { format } from "date-fns";
import {
  BanIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  EllipsisVerticalIcon,
  PencilIcon,
  PlayIcon,
  TrashIcon
} from "lucide-react";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { DeleteActionModal, Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import {
  Badge,
  Button,
  Detail,
  DetailLabel,
  DetailValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  UnstableDropdownMenu,
  UnstableDropdownMenuContent,
  UnstableDropdownMenuItem,
  UnstableDropdownMenuTrigger,
  UnstableEmpty,
  UnstableEmptyHeader,
  UnstableEmptyTitle,
  UnstableIconButton,
  UnstablePageLoader,
  UnstablePagination,
  UnstableTable,
  UnstableTableBody,
  UnstableTableCell,
  UnstableTableHead,
  UnstableTableHeader,
  UnstableTableRow
} from "@app/components/v3";
import { ProjectPermissionSub, useOrganization } from "@app/context";
import { ProjectPermissionPamDiscoveryActions } from "@app/context/ProjectPermissionContext/types";
import { usePagination } from "@app/hooks";
import { gatewaysQueryKeys } from "@app/hooks/api";
import type {
  PamDiscoveryType,
  TPamDiscoveryRunProgress,
  TPamDiscoverySource
} from "@app/hooks/api/pamDiscovery";
import {
  PAM_DISCOVERY_TYPE_MAP,
  useDeletePamDiscoverySource,
  useGetDiscoveredAccounts,
  useGetDiscoveredResources,
  useGetPamDiscoverySource,
  useListPamDiscoveryRuns,
  useTriggerPamDiscoveryScan
} from "@app/hooks/api/pamDiscovery";

import { PamUpdateDiscoverySourceModal } from "../PamDiscoveryPage/components/PamUpdateDiscoverySourceModal";

const STATUS_BADGE_MAP: Record<string, "success" | "danger" | "info"> = {
  active: "success",
  paused: "info",
  error: "danger",
  completed: "success",
  running: "info",
  failed: "danger",
  pending: "info"
};

const DiscoveryDetailsSection = ({
  source,
  onEdit
}: {
  source: TPamDiscoverySource;
  onEdit: VoidFunction;
}) => {
  return (
    <div className="flex w-full flex-col gap-3 rounded-lg border border-border bg-container px-4 py-3">
      <div className="flex items-center justify-between border-b border-border pb-2">
        <h3 className="text-lg font-medium">Details</h3>
        <ProjectPermissionCan
          I={ProjectPermissionPamDiscoveryActions.Edit}
          a={ProjectPermissionSub.PamDiscovery}
        >
          {(isAllowed) => (
            <UnstableIconButton variant="ghost" size="xs" onClick={onEdit} isDisabled={!isAllowed}>
              <PencilIcon />
            </UnstableIconButton>
          )}
        </ProjectPermissionCan>
      </div>
      <div className="space-y-4">
        <Detail>
          <DetailLabel>Name</DetailLabel>
          <DetailValue>{source.name}</DetailValue>
        </Detail>
        <Detail>
          <DetailLabel>Status</DetailLabel>
          <DetailValue>
            <Badge variant={STATUS_BADGE_MAP[source.status] || "info"}>{source.status}</Badge>
          </DetailValue>
        </Detail>
        <Detail>
          <DetailLabel>Schedule</DetailLabel>
          <DetailValue className="capitalize">{source.schedule || "Manual"}</DetailValue>
        </Detail>
        <Detail>
          <DetailLabel>Last Run</DetailLabel>
          <DetailValue>
            {source.lastRunAt ? format(new Date(source.lastRunAt), "MM/dd/yyyy, hh:mm a") : "Never"}
          </DetailValue>
        </Detail>
        <Detail>
          <DetailLabel>Created</DetailLabel>
          <DetailValue>{format(new Date(source.createdAt), "MM/dd/yyyy, hh:mm a")}</DetailValue>
        </Detail>
      </div>
    </div>
  );
};

const DiscoveryConfigurationSection = ({
  source,
  onEdit
}: {
  source: TPamDiscoverySource;
  onEdit: VoidFunction;
}) => {
  const { data: gateways } = useQuery(gatewaysQueryKeys.list());
  const gateway = gateways?.find((g) => g.id === source.gatewayId);

  return (
    <div className="flex w-full flex-col gap-3 rounded-lg border border-border bg-container px-4 py-3">
      <div className="flex items-center justify-between border-b border-border pb-2">
        <h3 className="text-lg font-medium">Configuration</h3>
        <ProjectPermissionCan
          I={ProjectPermissionPamDiscoveryActions.Edit}
          a={ProjectPermissionSub.PamDiscovery}
        >
          {(isAllowed) => (
            <UnstableIconButton variant="ghost" size="xs" onClick={onEdit} isDisabled={!isAllowed}>
              <PencilIcon />
            </UnstableIconButton>
          )}
        </ProjectPermissionCan>
      </div>
      <div className="space-y-4">
        {source.gatewayId && (
          <Detail>
            <DetailLabel>Gateway</DetailLabel>
            <DetailValue>{gateway?.name ?? "Unknown"}</DetailValue>
          </Detail>
        )}
        <Detail>
          <DetailLabel>Domain FQDN</DetailLabel>
          <DetailValue>{(source.discoveryConfiguration?.domainFQDN as string) || "-"}</DetailValue>
        </Detail>
        <Detail>
          <DetailLabel>DC Address</DetailLabel>
          <DetailValue>{(source.discoveryConfiguration?.dcAddress as string) || "-"}</DetailValue>
        </Detail>
        <Detail>
          <DetailLabel>Port</DetailLabel>
          <DetailValue>{(source.discoveryConfiguration?.port as number) ?? "-"}</DetailValue>
        </Detail>
      </div>
    </div>
  );
};

const DiscoveryCredentialsSection = ({
  source,
  onEdit
}: {
  source: TPamDiscoverySource;
  onEdit: VoidFunction;
}) => {
  return (
    <div className="flex w-full flex-col gap-3 rounded-lg border border-border bg-container px-4 py-3">
      <div className="flex items-center justify-between border-b border-border pb-2">
        <h3 className="text-lg font-medium">Credentials</h3>
        <ProjectPermissionCan
          I={ProjectPermissionPamDiscoveryActions.Edit}
          a={ProjectPermissionSub.PamDiscovery}
        >
          {(isAllowed) => (
            <UnstableIconButton variant="ghost" size="xs" onClick={onEdit} isDisabled={!isAllowed}>
              <PencilIcon />
            </UnstableIconButton>
          )}
        </ProjectPermissionCan>
      </div>
      <div className="space-y-4">
        <Detail>
          <DetailLabel>Username</DetailLabel>
          <DetailValue>{(source.discoveryCredentials?.username as string) || "-"}</DetailValue>
        </Detail>
        <Detail>
          <DetailLabel>Password</DetailLabel>
          <DetailValue>••••••••</DetailValue>
        </Detail>
      </div>
    </div>
  );
};

const formatDuration = (startedAt?: string | null, completedAt?: string | null): string => {
  if (!startedAt) return "-";
  const end = completedAt ? new Date(completedAt) : new Date();
  const seconds = Math.floor((end.getTime() - new Date(startedAt).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
};

const formatWindowsFileTime = (fileTime?: string): string => {
  if (!fileTime) return "-";
  try {
    const ms = Number(BigInt(fileTime) / 10000n - 11644473600000n);
    if (Number.isNaN(ms) || ms <= 0) return "-";
    return format(new Date(ms), "MMM d, yyyy HH:mm");
  } catch {
    return "-";
  }
};

const PROGRESS_BADGE_MAP: Record<string, "success" | "danger" | "info" | "neutral"> = {
  completed: "success",
  failed: "danger",
  running: "info",
  skipped: "neutral"
};

const RunExpandedContent = ({
  progress,
  errorMessage
}: {
  progress?: TPamDiscoveryRunProgress;
  errorMessage?: string | null;
}) => {
  const adEnum = progress?.adEnumeration;
  const depScan = progress?.dependencyScan;
  const machineErrors = progress?.machineErrors;
  const hasMachineErrors = machineErrors && Object.keys(machineErrors).length > 0;

  return (
    <div className="flex flex-col gap-4 px-8 py-4">
      <div className="flex gap-10">
        {adEnum && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium tracking-wider text-muted uppercase">
              AD Enumeration
            </span>
            <Badge variant={PROGRESS_BADGE_MAP[adEnum.status] || "info"}>{adEnum.status}</Badge>
            {adEnum.error && adEnum.error !== errorMessage && (
              <span className="text-xs text-red-400">{adEnum.error}</span>
            )}
          </div>
        )}
        {depScan && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium tracking-wider text-muted uppercase">
              Dependency Scan
            </span>
            <Badge variant={PROGRESS_BADGE_MAP[depScan.status] || "info"}>{depScan.status}</Badge>
            {depScan.totalMachines !== undefined && (
              <span className="text-xs text-muted">
                {depScan.scannedMachines ?? 0}/{depScan.totalMachines} machines
                {(depScan.failedMachines ?? 0) > 0 && (
                  <span className="ml-1 text-red-400">({depScan.failedMachines} failed)</span>
                )}
              </span>
            )}
            {depScan.reason && depScan.reason !== errorMessage && (
              <span className="text-xs text-muted">{depScan.reason}</span>
            )}
          </div>
        )}
      </div>
      {errorMessage && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium tracking-wider text-muted uppercase">Error</span>
          <span className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 font-mono text-xs text-red-400">
            {errorMessage}
          </span>
        </div>
      )}
      {hasMachineErrors && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium tracking-wider text-muted uppercase">
            Machine Errors
          </span>
          <div className="flex flex-col gap-1">
            {Object.entries(machineErrors).map(([host, err]) => (
              <div
                key={host}
                className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 font-mono text-xs"
              >
                <span className="font-semibold text-foreground">{host}</span>
                <span className="ml-2 text-muted">{err}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const RunsTab = ({
  discoverySourceId,
  discoveryType
}: {
  discoverySourceId: string;
  discoveryType: PamDiscoveryType;
}) => {
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const { page, perPage, setPage, setPerPage, offset } = usePagination("", {
    initPerPage: 20
  });

  const { data, isPending } = useListPamDiscoveryRuns(discoverySourceId, discoveryType, {
    offset,
    limit: perPage
  });

  const runs = data?.runs || [];
  const totalCount = data?.totalCount || 0;
  const COL_COUNT = 9;

  return (
    <div>
      <UnstableTable>
        <UnstableTableHeader>
          <UnstableTableRow>
            <UnstableTableHead className="w-8" />
            <UnstableTableHead>Started</UnstableTableHead>
            <UnstableTableHead>Duration</UnstableTableHead>
            <UnstableTableHead>Triggered By</UnstableTableHead>
            <UnstableTableHead>Status</UnstableTableHead>
            <UnstableTableHead>Resources</UnstableTableHead>
            <UnstableTableHead>Accounts</UnstableTableHead>
            <UnstableTableHead>New</UnstableTableHead>
            <UnstableTableHead>Stale</UnstableTableHead>
          </UnstableTableRow>
        </UnstableTableHeader>
        <UnstableTableBody>
          {isPending && (
            <UnstableTableRow>
              <UnstableTableCell colSpan={COL_COUNT} className="text-center text-muted">
                Loading runs...
              </UnstableTableCell>
            </UnstableTableRow>
          )}
          {!isPending && runs.length === 0 && (
            <UnstableTableRow>
              <UnstableTableCell colSpan={COL_COUNT}>
                <UnstableEmpty className="border-0 bg-transparent py-8 shadow-none">
                  <UnstableEmptyHeader>
                    <UnstableEmptyTitle>No discovery runs yet</UnstableEmptyTitle>
                  </UnstableEmptyHeader>
                </UnstableEmpty>
              </UnstableTableCell>
            </UnstableTableRow>
          )}
          {!isPending &&
            runs.map((run) => {
              const isExpanded = expandedRunId === run.id;
              const hasDetails =
                run.progress?.adEnumeration ||
                run.progress?.dependencyScan ||
                run.errorMessage ||
                (run.progress?.machineErrors && Object.keys(run.progress.machineErrors).length > 0);

              return (
                <>
                  <UnstableTableRow
                    key={run.id}
                    className={hasDetails ? "cursor-pointer" : undefined}
                    onClick={
                      hasDetails ? () => setExpandedRunId(isExpanded ? null : run.id) : undefined
                    }
                  >
                    <UnstableTableCell>
                      {hasDetails &&
                        (isExpanded ? (
                          <ChevronDownIcon className="size-4 text-muted" />
                        ) : (
                          <ChevronRightIcon className="size-4 text-muted" />
                        ))}
                    </UnstableTableCell>
                    <UnstableTableCell className="text-muted">
                      {run.startedAt ? format(new Date(run.startedAt), "MMM d, yyyy hh:mm a") : "-"}
                    </UnstableTableCell>
                    <UnstableTableCell className="text-muted">
                      {formatDuration(run.startedAt, run.completedAt)}
                    </UnstableTableCell>
                    <UnstableTableCell className="text-muted capitalize">
                      {run.triggeredBy}
                    </UnstableTableCell>
                    <UnstableTableCell>
                      <Badge variant={STATUS_BADGE_MAP[run.status] || "info"}>{run.status}</Badge>
                    </UnstableTableCell>
                    <UnstableTableCell>{run.resourcesDiscovered}</UnstableTableCell>
                    <UnstableTableCell>{run.accountsDiscovered}</UnstableTableCell>
                    <UnstableTableCell
                      className={twMerge(run.newSinceLastRun > 0 && "text-green-400")}
                    >
                      {run.newSinceLastRun > 0 ? `+${run.newSinceLastRun}` : run.newSinceLastRun}
                    </UnstableTableCell>
                    <UnstableTableCell>{run.staleSinceLastRun}</UnstableTableCell>
                  </UnstableTableRow>
                  {isExpanded && (
                    <UnstableTableRow key={`${run.id}-expanded`}>
                      <UnstableTableCell colSpan={COL_COUNT} className="p-0">
                        <RunExpandedContent
                          progress={run.progress}
                          errorMessage={run.errorMessage}
                        />
                      </UnstableTableCell>
                    </UnstableTableRow>
                  )}
                </>
              );
            })}
        </UnstableTableBody>
      </UnstableTable>
      {Boolean(totalCount) && !isPending && (
        <UnstablePagination
          count={totalCount}
          page={page}
          perPage={perPage}
          onChangePage={setPage}
          onChangePerPage={setPerPage}
        />
      )}
    </div>
  );
};

const ResourcesTab = ({
  discoverySourceId,
  discoveryType,
  projectId
}: {
  discoverySourceId: string;
  discoveryType: PamDiscoveryType;
  projectId: string;
}) => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const { page, perPage, setPage, setPerPage, offset } = usePagination("", {
    initPerPage: 20
  });

  const { data, isPending } = useGetDiscoveredResources(discoverySourceId, discoveryType, {
    offset,
    limit: perPage
  });

  const resources = data?.resources || [];
  const totalCount = data?.totalCount || 0;

  return (
    <div>
      <UnstableTable>
        <UnstableTableHeader>
          <UnstableTableRow>
            <UnstableTableHead>Name</UnstableTableHead>
            <UnstableTableHead>Type</UnstableTableHead>
            <UnstableTableHead>OS Version</UnstableTableHead>
            <UnstableTableHead>Last Discovered</UnstableTableHead>
            <UnstableTableHead>Status</UnstableTableHead>
          </UnstableTableRow>
        </UnstableTableHeader>
        <UnstableTableBody>
          {isPending && (
            <UnstableTableRow>
              <UnstableTableCell colSpan={5} className="text-center text-muted">
                Loading resources...
              </UnstableTableCell>
            </UnstableTableRow>
          )}
          {!isPending && resources.length === 0 && (
            <UnstableTableRow>
              <UnstableTableCell colSpan={5}>
                <UnstableEmpty className="border-0 bg-transparent py-8 shadow-none">
                  <UnstableEmptyHeader>
                    <UnstableEmptyTitle>No discovered resources</UnstableEmptyTitle>
                  </UnstableEmptyHeader>
                </UnstableEmpty>
              </UnstableTableCell>
            </UnstableTableRow>
          )}
          {!isPending &&
            resources.map((resource) => (
              <UnstableTableRow
                key={resource.id}
                className="cursor-pointer"
                onClick={() =>
                  navigate({
                    to: "/organizations/$orgId/projects/pam/$projectId/resources/$resourceType/$resourceId",
                    params: {
                      orgId: currentOrg.id,
                      projectId,
                      resourceType: resource.resourceType,
                      resourceId: resource.resourceId
                    }
                  })
                }
              >
                <UnstableTableCell className="font-medium">
                  {resource.resourceName}
                </UnstableTableCell>
                <UnstableTableCell className="text-muted">
                  {resource.resourceType}
                </UnstableTableCell>
                <UnstableTableCell className="text-muted" isTruncatable>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>{resource.resourceMetadata?.osVersion || "-"}</span>
                    </TooltipTrigger>
                    <TooltipContent side="left">
                      {resource.resourceMetadata?.osVersion || "-"}
                      {resource.resourceMetadata?.osVersionDetail &&
                        ` ${resource.resourceMetadata?.osVersionDetail}`}
                    </TooltipContent>
                  </Tooltip>
                </UnstableTableCell>
                <UnstableTableCell className="text-muted">
                  {format(new Date(resource.lastDiscoveredAt), "MMM d, yyyy HH:mm")}
                </UnstableTableCell>
                <UnstableTableCell>
                  {resource.isStale ? (
                    <Badge variant="danger">Stale</Badge>
                  ) : (
                    <Badge variant="success">Active</Badge>
                  )}
                </UnstableTableCell>
              </UnstableTableRow>
            ))}
        </UnstableTableBody>
      </UnstableTable>
      {Boolean(totalCount) && !isPending && (
        <UnstablePagination
          count={totalCount}
          page={page}
          perPage={perPage}
          onChangePage={setPage}
          onChangePerPage={setPerPage}
        />
      )}
    </div>
  );
};

const AccountsTab = ({
  discoverySourceId,
  discoveryType,
  projectId
}: {
  discoverySourceId: string;
  discoveryType: PamDiscoveryType;
  projectId: string;
}) => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const { page, perPage, setPage, setPerPage, offset } = usePagination("", {
    initPerPage: 20
  });

  const { data, isPending } = useGetDiscoveredAccounts(discoverySourceId, discoveryType, {
    offset,
    limit: perPage
  });

  const accounts = data?.accounts || [];
  const totalCount = data?.totalCount || 0;

  return (
    <div>
      <UnstableTable>
        <UnstableTableHeader>
          <UnstableTableRow>
            <UnstableTableHead>Name</UnstableTableHead>
            <UnstableTableHead>Resource</UnstableTableHead>
            <UnstableTableHead>Type</UnstableTableHead>
            <UnstableTableHead>Last Logon</UnstableTableHead>
            <UnstableTableHead>Last Discovered</UnstableTableHead>
            <UnstableTableHead>Status</UnstableTableHead>
          </UnstableTableRow>
        </UnstableTableHeader>
        <UnstableTableBody>
          {isPending && (
            <UnstableTableRow>
              <UnstableTableCell colSpan={6} className="text-center text-muted">
                Loading accounts...
              </UnstableTableCell>
            </UnstableTableRow>
          )}
          {!isPending && accounts.length === 0 && (
            <UnstableTableRow>
              <UnstableTableCell colSpan={6}>
                <UnstableEmpty className="border-0 bg-transparent py-8 shadow-none">
                  <UnstableEmptyHeader>
                    <UnstableEmptyTitle>No discovered accounts</UnstableEmptyTitle>
                  </UnstableEmptyHeader>
                </UnstableEmpty>
              </UnstableTableCell>
            </UnstableTableRow>
          )}
          {!isPending &&
            accounts.map((account) => (
              <UnstableTableRow
                key={account.id}
                className="cursor-pointer"
                onClick={() =>
                  navigate({
                    to: "/organizations/$orgId/projects/pam/$projectId/resources/$resourceType/$resourceId/accounts/$accountId",
                    params: {
                      orgId: currentOrg.id,
                      projectId,
                      resourceType: account.resourceType,
                      resourceId: account.resourceId,
                      accountId: account.accountId
                    }
                  })
                }
              >
                <UnstableTableCell className="font-medium">{account.accountName}</UnstableTableCell>
                <UnstableTableCell className="text-muted">{account.resourceName}</UnstableTableCell>
                <UnstableTableCell className="text-muted capitalize">
                  {account.metadata?.accountType ?? "-"}
                </UnstableTableCell>
                <UnstableTableCell className="text-muted">
                  {formatWindowsFileTime(account.metadata?.lastLogonTimestamp)}
                </UnstableTableCell>
                <UnstableTableCell className="text-muted">
                  {format(new Date(account.lastDiscoveredAt), "MMM d, yyyy HH:mm")}
                </UnstableTableCell>
                <UnstableTableCell>
                  {account.isStale ? (
                    <Badge variant="danger">Stale</Badge>
                  ) : (
                    <Badge variant="success">Active</Badge>
                  )}
                </UnstableTableCell>
              </UnstableTableRow>
            ))}
        </UnstableTableBody>
      </UnstableTable>
      {Boolean(totalCount) && !isPending && (
        <UnstablePagination
          count={totalCount}
          page={page}
          perPage={perPage}
          onChangePage={setPage}
          onChangePerPage={setPerPage}
        />
      )}
    </div>
  );
};

const PageContent = () => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const params = useParams({ strict: false }) as {
    discoverySourceId?: string;
    discoveryType?: string;
    projectId?: string;
  };

  const { discoverySourceId, projectId } = params;
  const discoveryType = params.discoveryType as PamDiscoveryType;

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const { data: source, isPending } = useGetPamDiscoverySource(
    discoverySourceId || "",
    discoveryType,
    {
      enabled: Boolean(discoverySourceId) && Boolean(discoveryType)
    }
  );

  const deleteMutation = useDeletePamDiscoverySource();
  const triggerScanMutation = useTriggerPamDiscoveryScan();

  if (isPending) {
    return <UnstablePageLoader />;
  }

  if (!source) {
    return (
      <div className="flex h-full w-full items-center justify-center px-20">
        <UnstableEmpty className="max-w-2xl">
          <UnstableEmptyHeader>
            <BanIcon className="size-8 text-muted" />
            <UnstableEmptyTitle className="text-muted">
              Could not find discovery source with ID {discoverySourceId}
            </UnstableEmptyTitle>
          </UnstableEmptyHeader>
        </UnstableEmpty>
      </div>
    );
  }

  const discoveryTypeInfo = PAM_DISCOVERY_TYPE_MAP[source.discoveryType];

  const handleBack = () => {
    navigate({
      to: "/organizations/$orgId/projects/pam/$projectId/discovery",
      params: { orgId: currentOrg.id, projectId: projectId! }
    });
  };

  const handleTriggerScan = async () => {
    try {
      await triggerScanMutation.mutateAsync({
        discoverySourceId: source.id,
        discoveryType: source.discoveryType
      });
      createNotification({ text: "Scan triggered successfully", type: "success" });
    } catch {
      createNotification({ text: "Failed to trigger scan", type: "error" });
    }
  };

  const handleDeleteConfirm = async () => {
    try {
      await deleteMutation.mutateAsync({
        discoverySourceId: source.id,
        discoveryType: source.discoveryType
      });
      createNotification({ text: "Discovery source deleted", type: "success" });
      handleBack();
    } catch {
      createNotification({ text: "Failed to delete discovery source", type: "error" });
    }
  };

  return (
    <div className="container mx-auto flex max-w-7xl flex-col px-6 py-6 text-mineshaft-50">
      <button
        type="button"
        onClick={handleBack}
        className="mb-4 flex items-center gap-1 text-sm text-bunker-300 hover:text-primary-400"
      >
        <FontAwesomeIcon icon={faChevronLeft} className="text-xs" />
        Discovery Sources
      </button>

      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-mineshaft-700">
            <img
              alt={discoveryTypeInfo.name}
              src={`/images/integrations/${discoveryTypeInfo.image}`}
              className="size-6"
            />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-mineshaft-100">{source.name}</h1>
            <p className="text-sm text-bunker-300">{discoveryTypeInfo.name} Discovery Source</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ProjectPermissionCan
            I={ProjectPermissionPamDiscoveryActions.RunScan}
            a={ProjectPermissionSub.PamDiscovery}
          >
            {(isAllowed) => (
              <Button
                variant="neutral"
                onClick={handleTriggerScan}
                isDisabled={!isAllowed}
                isPending={triggerScanMutation.isPending}
              >
                <PlayIcon className="size-4" />
                Trigger Scan
              </Button>
            )}
          </ProjectPermissionCan>
          <UnstableDropdownMenu>
            <UnstableDropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <EllipsisVerticalIcon />
              </Button>
            </UnstableDropdownMenuTrigger>
            <UnstableDropdownMenuContent align="end" sideOffset={2}>
              <ProjectPermissionCan
                I={ProjectPermissionPamDiscoveryActions.Edit}
                a={ProjectPermissionSub.PamDiscovery}
              >
                {(isAllowed) => (
                  <UnstableDropdownMenuItem
                    onClick={() => setIsEditModalOpen(true)}
                    isDisabled={!isAllowed}
                  >
                    Edit Source
                  </UnstableDropdownMenuItem>
                )}
              </ProjectPermissionCan>
              <ProjectPermissionCan
                I={ProjectPermissionPamDiscoveryActions.Delete}
                a={ProjectPermissionSub.PamDiscovery}
              >
                {(isAllowed) => (
                  <UnstableDropdownMenuItem
                    onClick={() => setIsDeleteModalOpen(true)}
                    variant="danger"
                    isDisabled={!isAllowed}
                  >
                    <TrashIcon className="size-4" />
                    Delete Source
                  </UnstableDropdownMenuItem>
                )}
              </ProjectPermissionCan>
            </UnstableDropdownMenuContent>
          </UnstableDropdownMenu>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Left Column */}
        <div className="flex w-80 shrink-0 flex-col gap-4">
          <DiscoveryDetailsSection source={source} onEdit={() => setIsEditModalOpen(true)} />
          <DiscoveryConfigurationSection source={source} onEdit={() => setIsEditModalOpen(true)} />
          <DiscoveryCredentialsSection source={source} onEdit={() => setIsEditModalOpen(true)} />
        </div>

        {/* Right Column - Tabbed Content */}
        <div className="flex-1">
          <Tabs defaultValue="runs">
            <TabList>
              <Tab value="runs">Runs</Tab>
              <Tab value="resources">Resources</Tab>
              <Tab value="accounts">Accounts</Tab>
            </TabList>
            <TabPanel value="runs">
              <RunsTab discoverySourceId={source.id} discoveryType={source.discoveryType} />
            </TabPanel>
            <TabPanel value="resources">
              <ResourcesTab
                discoverySourceId={source.id}
                discoveryType={source.discoveryType}
                projectId={projectId!}
              />
            </TabPanel>
            <TabPanel value="accounts">
              <AccountsTab
                discoverySourceId={source.id}
                discoveryType={source.discoveryType}
                projectId={projectId!}
              />
            </TabPanel>
          </Tabs>
        </div>
      </div>

      <PamUpdateDiscoverySourceModal
        isOpen={isEditModalOpen}
        onOpenChange={setIsEditModalOpen}
        source={source}
      />

      <DeleteActionModal
        isOpen={isDeleteModalOpen}
        title={`Delete discovery source "${source.name}"?`}
        subTitle="This will permanently remove this discovery source and all its run history."
        onChange={(isOpen) => setIsDeleteModalOpen(isOpen)}
        deleteKey="confirm"
        onDeleteApproved={handleDeleteConfirm}
      />
    </div>
  );
};

export const PamDiscoveryDetailPage = () => {
  return (
    <>
      <Helmet>
        <title>Discovery Source | Infisical</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <PageContent />
    </>
  );
};
