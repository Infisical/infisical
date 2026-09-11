import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangleIcon, Loader2Icon } from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
import { Alert, AlertAction, AlertDescription, AlertTitle, Button } from "@app/components/v3";
import { ProjectPermissionActions, ProjectPermissionSub, useProject } from "@app/context";
import { projectKeys, useEnableSecretBlindIndex } from "@app/hooks/api/projects";
import { secretInsightsKeys, useGetSecretBlindIndexStatus } from "@app/hooks/api/secretInsights";

/**
 * Duplicate values are matched through the project's secret value blind index, so the rule cannot
 * be saved until the project has one. Offers the same backfill the Insights page runs.
 */
export const BlindIndexAlert = () => {
  const { currentProject, projectId } = useProject();
  const queryClient = useQueryClient();
  const [wasTriggered, setWasTriggered] = useState(false);

  const enableBlindIndex = useEnableSecretBlindIndex();
  const isEnabled = currentProject.secretBlindIndexEnabled;

  const { data: status } = useGetSecretBlindIndexStatus(
    { projectId },
    {
      enabled: !isEnabled,
      refetchInterval: (query) =>
        ["completed", "failed", "not-found"].includes(query.state.data?.status ?? "") ? false : 2000
    }
  );

  // A backfill already running when the form opened should show as running here too.
  useEffect(() => {
    if (status?.status === "pending") setWasTriggered(true);
  }, [status?.status]);

  // The project query never goes stale on its own, so the flag has to be refetched by hand.
  useEffect(() => {
    if (status?.status === "completed" && wasTriggered) {
      queryClient.invalidateQueries({ queryKey: projectKeys.getProjectById(projectId) });
    }
  }, [status?.status, wasTriggered, projectId, queryClient]);

  if (isEnabled) return null;

  const handleEnable = () => {
    setWasTriggered(true);
    enableBlindIndex.reset();
    enableBlindIndex.mutate(
      { projectId },
      {
        onSuccess: () =>
          queryClient.invalidateQueries({
            queryKey: secretInsightsKeys.blindIndexStatus({ projectId })
          })
      }
    );
  };

  const hasFailed = status?.status === "failed" && !enableBlindIndex.isPending;

  if (wasTriggered && !hasFailed) {
    return (
      <Alert variant="info" className="mt-3">
        <Loader2Icon className="animate-spin" />
        <AlertDescription>
          Indexing secrets so duplicate values can be detected. This may take a moment.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert variant={hasFailed ? "danger" : "warning"} className="mt-3">
      <AlertTriangleIcon />
      <AlertTitle>{hasFailed ? "Could not index secrets" : "Secret indexing required"}</AlertTitle>
      <AlertDescription>
        <span>
          {hasFailed
            ? (status?.message ?? "Unknown error")
            : "This constraint compares values through the project's secret index. Enable it to save the rule."}
        </span>
        <AlertAction>
          <ProjectPermissionCan I={ProjectPermissionActions.Edit} a={ProjectPermissionSub.Settings}>
            {(isAllowed) => (
              <Button
                variant="outline"
                size="xs"
                onClick={handleEnable}
                isDisabled={!isAllowed}
                isPending={enableBlindIndex.isPending}
              >
                {hasFailed ? "Retry" : "Enable Indexing"}
              </Button>
            )}
          </ProjectPermissionCan>
        </AlertAction>
      </AlertDescription>
    </Alert>
  );
};
