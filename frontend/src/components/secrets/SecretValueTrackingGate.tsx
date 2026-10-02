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
import { useDelayedLoading } from "@app/hooks";
import {
  TGetOrgSecretValueTrackingStatusResponse,
  useEnableOrgSecretValueTracking,
  useGetOrgSecretValueTrackingStatus
} from "@app/hooks/api/secretInsights";

type TOrgSecretValueTracking = {
  isLoading: boolean;
  isLoadingVisible: boolean;
  isTrackingOn: boolean;
  // Tracking is on and no loading state is still being held on screen.
  isReady: boolean;
  status?: TGetOrgSecretValueTrackingStatusResponse;
  isEnablePending: boolean;
  enable: () => void;
};

// Everything that searches by value (org duplicates, search by secret value) needs the org index
// finished first, so they share one way of asking for it and of showing the run.
export const useOrgSecretValueTracking = ({
  orgId,
  enabled
}: {
  orgId: string;
  enabled: boolean;
}): TOrgSecretValueTracking => {
  const enableTracking = useEnableOrgSecretValueTracking();
  const { data: status, isPending } = useGetOrgSecretValueTrackingStatus(orgId, { enabled });
  const isLoading = enabled && isPending;
  // The status usually comes back before the sheet or card finishes rendering, so the skeleton
  // only appears on a slow request, and then stays long enough not to flash.
  const isLoadingVisible = useDelayedLoading(isLoading, { delay: 300, minDuration: 500 });
  // The status route reports completed whenever the org flag is set, so this is the durable answer.
  const isTrackingOn = status?.status === "completed";

  return {
    isLoading,
    isLoadingVisible,
    isTrackingOn,
    isReady: isTrackingOn && !isLoadingVisible,
    status,
    isEnablePending: enableTracking.isPending,
    enable: () => enableTracking.mutate({ orgId })
  };
};

// Renders whatever stands between the caller and a finished index. Callers render their own
// content once `tracking.isReady` is true.
export const SecretValueTrackingPrompt = ({
  tracking,
  featureName,
  description
}: {
  tracking: TOrgSecretValueTracking;
  // Lowercase, as it reads mid-sentence (eg "duplicate secret detection").
  featureName: string;
  description: string;
}) => {
  const { status, isLoading, isLoadingVisible, isEnablePending, enable } = tracking;

  if (isLoadingVisible) return <Skeleton className="h-[200px] w-full" />;
  if (isLoading) return null;

  if (status?.status === "failed" && !isEnablePending) {
    return (
      <div className="flex h-[200px] flex-col items-center justify-center gap-3">
        <AlertTriangleIcon className="size-6 text-danger" />
        <p className="text-sm text-danger">
          Could not enable {featureName}: {status.message ?? "Unknown error"}
        </p>
        <Button variant="outline" onClick={enable}>
          Retry
        </Button>
      </div>
    );
  }

  if (status?.status === "pending" || isEnablePending) {
    return (
      <div className="flex h-[200px] flex-col items-center justify-center gap-3 text-center">
        <Loader2Icon className="size-6 animate-spin text-org" />
        <p className="text-sm text-foreground">
          {status?.projectsTotal
            ? `Enabling ${featureName}: ${status.projectsDone} of ${status.projectsTotal} projects ready`
            : `Enabling ${featureName}`}
        </p>
        <p className="max-w-md text-sm text-muted">
          You can leave this page. This finishes in the background.
        </p>
      </div>
    );
  }

  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyTitle>
          {featureName.charAt(0).toUpperCase()}
          {featureName.slice(1)} is not enabled
        </EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
        <EmptyContent>
          <Button variant="org" size="xs" onClick={enable}>
            Enable
          </Button>
        </EmptyContent>
      </EmptyHeader>
    </Empty>
  );
};
