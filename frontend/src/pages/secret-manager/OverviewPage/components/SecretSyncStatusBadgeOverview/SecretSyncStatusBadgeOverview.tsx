import { useMemo, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { AlertTriangleIcon, CheckIcon, RefreshCwIcon } from "lucide-react";

import { SecretSyncStatusBadge } from "@app/components/secret-syncs";
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
      <PopoverContent onWheel={(e) => e.stopPropagation()} align="end" className="w-[480px] p-0">
        <div className="px-4 py-3 text-xs font-medium">{popoverTitle}</div>
        <UnstableTable containerClassName="max-h-[300px] overflow-y-auto rounded-none border-x-0 border-t border-b-0">
          <UnstableTableHeader className="sticky top-0 z-10 bg-container">
            <UnstableTableRow>
              <UnstableTableHead>Type</UnstableTableHead>
              <UnstableTableHead>Name</UnstableTableHead>
              <UnstableTableHead>Status</UnstableTableHead>
            </UnstableTableRow>
          </UnstableTableHeader>
          <UnstableTableBody>
            {filteredSyncs.map((sync) => (
              <UnstableTableRow key={sync.id} onClick={() => handleNavigateToSync(sync)}>
                <UnstableTableCell>
                  <img
                    alt={`${SECRET_SYNC_MAP[sync.destination].name} sync`}
                    src={`/images/integrations/${SECRET_SYNC_MAP[sync.destination].image}`}
                    className="h-5 w-5"
                  />
                </UnstableTableCell>
                <UnstableTableCell className="max-w-0 min-w-32!">
                  <div className="flex items-center gap-2">
                    <span className="truncate">{sync.name}</span>
                  </div>
                </UnstableTableCell>
                <UnstableTableCell>
                  {sync.syncStatus && (
                    <SecretSyncStatusBadge
                      status={sync.syncStatus}
                      lastSyncedAt={sync.lastSyncedAt}
                      lastSyncMessage={sync.lastSyncMessage}
                    />
                  )}
                </UnstableTableCell>
              </UnstableTableRow>
            ))}
          </UnstableTableBody>
        </UnstableTable>
      </PopoverContent>
    </Popover>
  );
};
