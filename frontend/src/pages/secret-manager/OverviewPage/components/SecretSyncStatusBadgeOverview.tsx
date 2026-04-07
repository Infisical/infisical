import { useMemo } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangleIcon, CheckIcon, RefreshCwIcon } from "lucide-react";

import { Badge, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import { useProject } from "@app/context";
import { SecretSyncStatus, useListSecretSyncs } from "@app/hooks/api/secretSyncs";
import { IntegrationsListPageTabs } from "@app/types/integrations";

type BadgeState = {
  variant: "neutral" | "danger" | "success";
  label: string;
  Icon: typeof RefreshCwIcon;
  isAnimated: boolean;
  tooltipTitle: string;
};

export const SecretSyncStatusBadgeOverview = () => {
  const navigate = useNavigate();
  const { projectId } = useProject();
  const orgId = useParams({
    from: ROUTE_PATHS.SecretManager.OverviewPage.id,
    select: (el) => el.orgId
  });

  const { data: secretSyncs = [] } = useListSecretSyncs(projectId, {
    refetchInterval: 10_000
  });

  const { runningSyncs, failedSyncs, succeededSyncs } = useMemo(() => {
    const running = secretSyncs.filter(
      (s) => s.syncStatus === SecretSyncStatus.Running || s.syncStatus === SecretSyncStatus.Pending
    );
    const failed = secretSyncs.filter((s) => s.syncStatus === SecretSyncStatus.Failed);
    const succeeded = secretSyncs.filter((s) => s.syncStatus === SecretSyncStatus.Succeeded);
    return { runningSyncs: running, failedSyncs: failed, succeededSyncs: succeeded };
  }, [secretSyncs]);

  const badgeState = useMemo((): BadgeState | null => {
    if (secretSyncs.length === 0) return null;

    if (runningSyncs.length > 0) {
      return {
        variant: "neutral",
        label: `Syncing (${runningSyncs.length})`,
        Icon: RefreshCwIcon,
        isAnimated: true,
        tooltipTitle: "Currently Syncing"
      };
    }

    if (failedSyncs.length > 0) {
      return {
        variant: "danger",
        label: `Sync Failed (${failedSyncs.length})`,
        Icon: AlertTriangleIcon,
        isAnimated: false,
        tooltipTitle: "Failed Syncs"
      };
    }

    if (succeededSyncs.length > 0) {
      return {
        variant: "success",
        label: "Synced",
        Icon: CheckIcon,
        isAnimated: false,
        tooltipTitle: "All Syncs Succeeded"
      };
    }

    return null;
  }, [secretSyncs, runningSyncs, failedSyncs, succeededSyncs]);

  const displayedSyncs = useMemo(() => {
    if (runningSyncs.length > 0) return runningSyncs;
    if (failedSyncs.length > 0) return failedSyncs;
    return succeededSyncs;
  }, [runningSyncs, failedSyncs, succeededSyncs]);

  if (!badgeState) return null;

  const { variant, label, Icon, isAnimated, tooltipTitle } = badgeState;

  const handleNavigateToSyncs = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate({
      to: ROUTE_PATHS.SecretManager.IntegrationsListPage.path,
      params: { orgId, projectId },
      search: { selectedTab: IntegrationsListPageTabs.SecretSyncs }
    });
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge asChild variant={variant}>
          <button type="button" onClick={handleNavigateToSyncs}>
            <Icon className={isAnimated ? "animate-spin" : ""} />
            {label}
          </button>
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <div className="flex flex-col gap-1.5 py-1">
          <span className="text-xs font-medium">{tooltipTitle}</span>
          {displayedSyncs.slice(0, 8).map((sync) => (
            <div key={sync.id} className="flex items-center gap-2 text-xs">
              <span className="truncate">{sync.name}</span>
              {sync.lastSyncedAt && (
                <span className="ml-auto shrink-0 text-accent">
                  {formatDistanceToNow(new Date(sync.lastSyncedAt), { addSuffix: true })}
                </span>
              )}
            </div>
          ))}
          {displayedSyncs.length > 8 && (
            <span className="text-xs text-accent">and {displayedSyncs.length - 8} more...</span>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
};
