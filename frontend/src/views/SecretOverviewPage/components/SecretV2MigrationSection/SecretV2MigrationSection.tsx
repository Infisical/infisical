import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";

import { Button, Spinner } from "@app/components/v2";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useProjectPermission,
  useWorkspace
} from "@app/context";
import { useGetWorkspaceById, useMigrateProjectToV3 } from "@app/hooks/api";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";
import { ProjectVersion } from "@app/hooks/api/workspace/types";

enum ProjectUpgradeStatus {
  InProgress = "IN_PROGRESS",
  // Completed -> Will be null if completed. So a completed status is not needed
  Failed = "FAILED"
}

export const SecretV2MigrationSection = () => {
  const { currentWorkspace } = useWorkspace();
  const { data: workspaceDetails } = useGetWorkspaceById(
    // if v3 no need to fetch
    currentWorkspace?.version === ProjectVersion.V3 ? "" : currentWorkspace?.id || "",
    {
      refetchInterval:
        currentWorkspace?.upgradeStatus === ProjectUpgradeStatus.InProgress ? 3000 : false
    }
  );
  const { membership } = useProjectPermission();
  const migrateProjectToV3 = useMigrateProjectToV3();

  const isProjectUpgraded = workspaceDetails?.version === ProjectVersion.V3;

  if (isProjectUpgraded || currentWorkspace?.version === ProjectVersion.V3) return null;
  const isUpgrading = workspaceDetails?.upgradeStatus === ProjectUpgradeStatus.InProgress;

  const handleMigrationSecretV2 = async () => {
    try {
      await migrateProjectToV3.mutateAsync({ workspaceId: currentWorkspace?.id || "" });
      createNotification({
        text: "Migrated project to new KMS",
        type: "success"
      });
    } catch {
      createNotification({
        text: "Failed to upgrade project",
        type: "error"
      });
    }
  };
  // for non admin this would throw an error
  // so no need to render
  return (
    <div className="mt-4 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      {isUpgrading && (
        <div className="absolute top-0 left-0 z-50 flex h-screen w-screen items-center justify-center bg-bunker-500 bg-opacity-80">
          <Spinner size="lg" className="text-primary" />
          <div className="ml-4 flex flex-col space-y-1">
            <div className="text-3xl font-medium">Please wait</div>
            <span className="inline-block">Upgrading your project...</span>
          </div>
        </div>
      )}
      <p className="mb-2 text-lg font-semibold">Action Required</p>
      <p className="mb-4 leading-7 text-gray-400">
        There is a new update for your project. Introducing Infisical KMS.
        <b>
          {membership.role !== ProjectMembershipRole.Admin && "This is an admin only operation."}
        </b>
      </p>
      <ProjectPermissionCan I={ProjectPermissionActions.Edit} a={ProjectPermissionSub.Settings}>
        {(isAllowed) => (
          <Button
            onClick={handleMigrationSecretV2}
            isDisabled={
              !isAllowed || membership.role !== ProjectMembershipRole.Admin || isUpgrading
            }
            color="mineshaft"
            type="submit"
            isLoading={migrateProjectToV3.isLoading}
          >
            Start Migration
          </Button>
        )}
      </ProjectPermissionCan>
    </div>
  );
};
