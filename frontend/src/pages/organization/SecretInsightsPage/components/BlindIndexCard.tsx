import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { Alert, AlertAction, AlertDescription, AlertTitle, Button } from "@app/components/v3";
import { OrgPermissionActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import {
  useGetOrgBlindIndexMigrationStatus,
  useStartOrgBlindIndexMigration
} from "@app/hooks/api/secretInsights";

const POLL_INTERVAL_MS = 5000;

const pluralizeProjects = (count: number) => (count === 1 ? "Project" : "Projects");

export const BlindIndexCard = () => {
  const { currentOrg } = useOrganization();

  const { data: status, isPending } = useGetOrgBlindIndexMigrationStatus(currentOrg.id, {
    refetchInterval: (query) => (query.state.data?.isRunning ? POLL_INTERVAL_MS : false)
  });

  const startMigration = useStartOrgBlindIndexMigration();

  if (isPending || !status) return null;

  const { pendingProjectCount, isRunning } = status;
  if (!pendingProjectCount && !isRunning) return null;

  const handleEnable = () => {
    startMigration.mutate(
      { orgId: currentOrg.id },
      {
        onSuccess: ({ pendingProjectCount: scheduledProjectCount }) =>
          createNotification({
            text: `Blind index migration started for ${scheduledProjectCount} ${pluralizeProjects(
              scheduledProjectCount
            ).toLowerCase()}`,
            type: "success"
          })
      }
    );
  };

  return (
    <Alert variant="danger">
      <AlertTitle>
        Duplicate secrets detection is unavailable for {pendingProjectCount}{" "}
        {pluralizeProjects(pendingProjectCount)}
      </AlertTitle>
      <AlertDescription className="items-center @sm/alert:flex-col @sm/alert:justify-start">
        <p>
          {isRunning
            ? `Indexing the remaining ${pendingProjectCount} ${pluralizeProjects(pendingProjectCount)} for duplicate secrets detection. This may take a few minutes.`
            : "Projects without secret value indexing are excluded from duplicate secrets detection. Enable indexing for complete results."}
        </p>
        <AlertAction>
          <OrgPermissionCan I={OrgPermissionActions.Edit} an={OrgPermissionSubjects.Settings}>
            {(isAllowed) => (
              <Button
                variant="warning"
                size="xs"
                isDisabled={!isAllowed || isRunning}
                isPending={isRunning || startMigration.isPending}
                onClick={handleEnable}
              >
                Enable on {pendingProjectCount} {pluralizeProjects(pendingProjectCount)}
              </Button>
            )}
          </OrgPermissionCan>
        </AlertAction>
      </AlertDescription>
    </Alert>
  );
};
