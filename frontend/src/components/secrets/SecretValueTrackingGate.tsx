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

  return {
    isLoading: enabled && isPending,
    // The status route reports completed whenever the org flag is set, so this is the durable answer.
    isTrackingOn: status?.status === "completed",
    status,
    isEnablePending: enableTracking.isPending,
    enable: () => enableTracking.mutate({ orgId })
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
  const { status, isLoading, isEnablePending, enable } = tracking;

  if (isLoading) return <Skeleton className="h-[200px] w-full" />;

  if (status?.status === "failed" && !isEnablePending) {
    return (
      <div className="flex h-[200px] flex-col items-center justify-center gap-3">
        <AlertTriangleIcon className="size-6 text-danger" />
        <p className="text-sm text-danger">
          Could not enable secret value search: {status.message ?? "Unknown error"}
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
            ? `Enabling secret value search: ${status.projectsDone} of ${status.projectsTotal} projects ready`
            : "Enabling secret value search"}
        </p>
        <p className="max-w-md text-sm text-muted">
          You can leave this page. Search is ready here when this finishes.
        </p>
      </div>
    );
  }

  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyTitle>Secret value search is not enabled</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
        <EmptyContent>
          <Button variant="org" size="xs" onClick={enable}>
            Enable Secret Value Search
          </Button>
        </EmptyContent>
      </EmptyHeader>
    </Empty>
  );
};
