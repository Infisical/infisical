import { useEffect, useRef, useState } from "react";
import { AlertTriangleIcon, Loader2Icon } from "lucide-react";

import {
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Skeleton
} from "@app/components/v3";
import {
  TGetOrgSecretValueTrackingStatusResponse,
  useEnableOrgSecretValueTracking,
  useGetOrgSecretValueTrackingStatus
} from "@app/hooks/api/secretInsights";

type TOrgSecretValueTracking = {
  isLoading: boolean;
  isTrackingOn: boolean;
  status?: TGetOrgSecretValueTrackingStatusResponse;
  isRunStarting: boolean;
  isEnablePending: boolean;
  enable: () => void;
};

// Everything that searches by value (org duplicates, search by secret value) needs the org index
// finished first, so they share one way of asking for it and of showing the run.
export const useOrgSecretValueTracking = ({
  orgId,
  enabled,
  onTrackingOn
}: {
  orgId: string;
  enabled: boolean;
  onTrackingOn?: () => void;
}): TOrgSecretValueTracking => {
  const enableTracking = useEnableOrgSecretValueTracking();
  const {
    data: status,
    isPending,
    dataUpdatedAt
  } = useGetOrgSecretValueTrackingStatus(orgId, { enabled });

  // Only a run this view started or saw in flight should report completion: a completed status
  // seen on first load is simply "already on". Keyed on the fetch time because a small org can go
  // from enable to completed before the first poll, so the status value alone may never change.
  const [awaitingRun, setAwaitingRun] = useState(false);
  const onTrackingOnRef = useRef(onTrackingOn);
  onTrackingOnRef.current = onTrackingOn;
  useEffect(() => {
    if (status?.status === "pending") setAwaitingRun(true);
    if (status?.status === "failed") setAwaitingRun(false);
    if (status?.status === "completed" && awaitingRun) {
      setAwaitingRun(false);
      onTrackingOnRef.current?.();
    }
  }, [status?.status, dataUpdatedAt, awaitingRun]);

  const enable = () => {
    enableTracking.reset();
    enableTracking.mutate(
      { orgId },
      {
        onSuccess: () => setAwaitingRun(true)
      }
    );
  };

  return {
    isLoading: enabled && isPending,
    // The status route reports completed whenever the org flag is set, so this is the durable answer.
    isTrackingOn: status?.status === "completed" && !awaitingRun,
    status,
    isRunStarting: enableTracking.isPending || (enableTracking.isSuccess && awaitingRun),
    isEnablePending: enableTracking.isPending,
    enable
  };
};

// Renders whatever stands between the caller and a finished index. Callers render their own
// content once `tracking.isTrackingOn` is true.
export const SecretValueTrackingPrompt = ({
  tracking,
  description
}: {
  tracking: TOrgSecretValueTracking;
  description: string;
}) => {
  const { status, isLoading, isRunStarting, isEnablePending, enable } = tracking;

  if (isLoading) return <Skeleton className="h-[200px] w-full" />;

  if (status?.status === "failed" && !isEnablePending) {
    return (
      <div className="flex h-[200px] flex-col items-center justify-center gap-3">
        <AlertTriangleIcon className="size-6 text-danger" />
        <p className="text-sm text-danger">
          Failed to index secrets: {status.message ?? "Unknown error"}
        </p>
        <Button variant="outline" onClick={enable}>
          Retry
        </Button>
      </div>
    );
  }

  if (status?.status === "pending" || isRunStarting) {
    return (
      <div className="flex h-[200px] flex-col items-center justify-center gap-3 text-center">
        <Loader2Icon className="size-6 animate-spin text-org" />
        <p className="text-sm text-foreground">
          {status?.projectsTotal
            ? `Indexed ${status.projectsDone} of ${status.projectsTotal} projects`
            : "Starting to index secrets"}
        </p>
        <p className="max-w-md text-sm text-muted">
          {status?.secretsProcessed
            ? `${status.secretsProcessed.toLocaleString()} secrets checked so far. `
            : ""}
          You can leave this page. Indexing keeps going, and this is ready when it finishes.
        </p>
      </div>
    );
  }

  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyTitle>Secret value indexing is not turned on</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
        <EmptyContent>
          <Button variant="org" size="xs" onClick={enable}>
            Turn On Indexing
          </Button>
        </EmptyContent>
      </EmptyHeader>
    </Empty>
  );
};
