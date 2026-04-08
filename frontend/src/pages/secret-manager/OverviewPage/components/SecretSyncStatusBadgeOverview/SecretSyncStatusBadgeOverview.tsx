import { useMemo, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangleIcon, CheckIcon, RefreshCwIcon } from "lucide-react";

import {
  Badge,
  Popover,
  PopoverContent,
  PopoverTrigger,
  UnstableTable,
  UnstableTableBody,
  UnstableTableCell,
  UnstableTableHead,
  UnstableTableHeader,
  UnstableTableRow
} from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import { useProject } from "@app/context";
import { SECRET_SYNC_MAP } from "@app/helpers/secretSyncs";
import { SecretSyncStatus, TSecretSync, useListSecretSyncs } from "@app/hooks/api/secretSyncs";

const PAGE_SIZE = 5;

const SYNC_STATUS_CONFIG: Record<SecretSyncStatus, { label: string; className: string }> = {
  [SecretSyncStatus.Running]: { label: "Syncing", className: "text-blue-400" },
  [SecretSyncStatus.Pending]: { label: "Pending", className: "text-blue-400" },
  [SecretSyncStatus.Failed]: { label: "Failed", className: "text-red-400" },
  [SecretSyncStatus.Succeeded]: { label: "Synced", className: "text-green-400" }
};

type BadgeState = {
  variant: "info" | "danger" | "success";
  label: string;
  Icon: typeof RefreshCwIcon;
  isAnimated: boolean;
  popoverTitle: string;
};

type Props = {
  environmentSlugs?: string[];
};

export const SecretSyncStatusBadgeOverview = ({ environmentSlugs }: Props) => {
  const navigate = useNavigate();
  const { projectId } = useProject();
  const orgId = useParams({
    from: ROUTE_PATHS.SecretManager.OverviewPage.id,
    select: (el) => el.orgId
  });

  const [isOpen, setIsOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const { data: secretSyncs = [] } = useListSecretSyncs(projectId, {
    refetchInterval: 20_000
  });

  const filteredSyncs = useMemo(() => {
    if (!environmentSlugs || environmentSlugs.length === 0) return secretSyncs;
    return secretSyncs.filter(
      (s) => s.environment && environmentSlugs.includes(s.environment.slug)
    );
  }, [secretSyncs, environmentSlugs]);

  const { runningSyncs, failedSyncs, succeededSyncs } = useMemo(() => {
    const running = filteredSyncs.filter(
      (s) => s.syncStatus === SecretSyncStatus.Running || s.syncStatus === SecretSyncStatus.Pending
    );
    const failed = filteredSyncs.filter((s) => s.syncStatus === SecretSyncStatus.Failed);
    const succeeded = filteredSyncs.filter((s) => s.syncStatus === SecretSyncStatus.Succeeded);
    return { runningSyncs: running, failedSyncs: failed, succeededSyncs: succeeded };
  }, [filteredSyncs]);

  const badgeState = useMemo((): BadgeState | null => {
    if (filteredSyncs.length === 0) return null;

    if (runningSyncs.length > 0) {
      return {
        variant: "info",
        label: runningSyncs.length === 1 ? "Syncing" : `Syncing (${runningSyncs.length})`,
        Icon: RefreshCwIcon,
        isAnimated: true,
        popoverTitle: "Currently Syncing"
      };
    }

    if (failedSyncs.length > 0) {
      return {
        variant: "danger",
        label: failedSyncs.length === 1 ? "Sync Failed" : `Sync Failed (${failedSyncs.length})`,
        Icon: AlertTriangleIcon,
        isAnimated: false,
        popoverTitle: "Failed Syncs"
      };
    }

    if (succeededSyncs.length > 0) {
      return {
        variant: "success",
        label: "Synced",
        Icon: CheckIcon,
        isAnimated: false,
        popoverTitle: "All Syncs Succeeded"
      };
    }

    return null;
  }, [filteredSyncs, runningSyncs, failedSyncs, succeededSyncs]);

  if (!badgeState) return null;

  const { variant, label, Icon, isAnimated, popoverTitle } = badgeState;

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) setVisibleCount(PAGE_SIZE);
  };

  const handleNavigateToSync = (sync: TSecretSync) => {
    navigate({
      to: ROUTE_PATHS.SecretManager.SecretSyncDetailsByIDPage.path,
      params: {
        syncId: sync.id,
        destination: sync.destination,
        projectId,
        orgId
      }
    });
  };

  const remaining = filteredSyncs.length - visibleCount;

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Badge asChild variant={variant}>
          <button type="button">
            <Icon className={isAnimated ? "animate-spin" : ""} />
            {label}
          </button>
        </Badge>
      </PopoverTrigger>
      <PopoverContent onWheel={(e) => e.stopPropagation()} align="end" className="w-80 p-0">
        <div className="px-3 py-2 text-xs font-medium">{popoverTitle}</div>
        <UnstableTable containerClassName="rounded-none border-x-0 border-t border-b-0">
          <UnstableTableHeader>
            <UnstableTableRow>
              <UnstableTableHead>Name</UnstableTableHead>
              <UnstableTableHead>Type</UnstableTableHead>
              <UnstableTableHead>Status</UnstableTableHead>
              <UnstableTableHead className="text-right">Last Synced</UnstableTableHead>
            </UnstableTableRow>
          </UnstableTableHeader>
          <UnstableTableBody>
            {filteredSyncs.slice(0, visibleCount).map((sync) => {
              const statusConfig = sync.syncStatus ? SYNC_STATUS_CONFIG[sync.syncStatus] : null;
              // const destinationDetails = SECRET_SYNC_MAP[sync.destination];

              return (
                <UnstableTableRow key={sync.id} onClick={() => handleNavigateToSync(sync)}>
                  <UnstableTableCell className="max-w-0 min-w-32!">
                    <div className="flex items-center gap-2">
                      <span className="truncate">{sync.name}</span>
                    </div>
                  </UnstableTableCell>
                  <UnstableTableCell>
                    <span className="text-xs capitalize">
                      {SECRET_SYNC_MAP[sync.destination].name}
                    </span>
                  </UnstableTableCell>
                  <UnstableTableCell>
                    <span className={`text-xs ${statusConfig?.className ?? "text-accent"}`}>
                      {statusConfig?.label ?? "—"}
                    </span>
                  </UnstableTableCell>
                  <UnstableTableCell className="text-right text-xs text-accent">
                    {sync.lastSyncedAt
                      ? formatDistanceToNow(new Date(sync.lastSyncedAt), { addSuffix: true })
                      : "Never"}
                  </UnstableTableCell>
                </UnstableTableRow>
              );
            })}
          </UnstableTableBody>
        </UnstableTable>
        {remaining > 0 && (
          <button
            type="button"
            onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
            className="w-full border-t border-border px-3 py-2 text-center text-xs text-accent hover:text-mineshaft-200"
          >
            Show more ({remaining} remaining)
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
};
