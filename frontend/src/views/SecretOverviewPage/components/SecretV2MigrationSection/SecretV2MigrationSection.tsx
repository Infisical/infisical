import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { faTriangleExclamation, faWarning } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, Checkbox, Modal, ModalContent, Spinner } from "@app/components/v2";
import { useProjectPermission, useWorkspace } from "@app/context";
import { usePopUp } from "@app/hooks";
import { useGetWorkspaceById, useMigrateProjectToV3 } from "@app/hooks/api";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";
import { ProjectVersion } from "@app/hooks/api/workspace/types";

enum ProjectUpgradeStatus {
  InProgress = "IN_PROGRESS",
  // Completed -> Will be null if completed. So a completed status is not needed
  Failed = "FAILED"
}

const formSchema = z.object({
  isCLIChecked: z.literal(true),
  isOperatorChecked: z.literal(true),
  shouldCloseOpenApprovals: z.literal(true)
});

export const SecretV2MigrationSection = () => {
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["migrationInfo"] as const);
  const { currentWorkspace } = useWorkspace();
  const { data: workspaceDetails, refetch } = useGetWorkspaceById(
    // if v3 no need to fetch
    currentWorkspace?.version === ProjectVersion.V3 ? "" : currentWorkspace?.id || "",
    {
      refetchInterval:
        currentWorkspace?.upgradeStatus === ProjectUpgradeStatus.InProgress ? 2000 : false
    }
  );
  const { membership } = useProjectPermission();
  const migrateProjectToV3 = useMigrateProjectToV3();
  const { handleSubmit, control, reset } = useForm({ resolver: zodResolver(formSchema) });
  useEffect(() => {
    if (!popUp.migrationInfo.isOpen) {
      reset();
    }
  }, [popUp.migrationInfo.isOpen]);

  const isProjectUpgraded = workspaceDetails?.version === ProjectVersion.V3;

  useEffect(() => {
    if (isProjectUpgraded && migrateProjectToV3.data) {
      createNotification({ type: "success", text: "Project upgrade completed successfully" });
      migrateProjectToV3.reset();
    }
  }, [isProjectUpgraded, Boolean(migrateProjectToV3.data)]);

  if (isProjectUpgraded || currentWorkspace?.version === ProjectVersion.V3) return null;

  const isUpgrading = workspaceDetails?.upgradeStatus === ProjectUpgradeStatus.InProgress;
  const didProjectUpgradeFailed = workspaceDetails?.upgradeStatus === ProjectUpgradeStatus.Failed;

  const handleMigrationSecretV2 = async () => {
    try {
      handlePopUpToggle("migrationInfo");
      await migrateProjectToV3.mutateAsync({ workspaceId: currentWorkspace?.id || "" });
      refetch();
      createNotification({
        text: "Project upgrade started",
        type: "success"
      });
    } catch {
      createNotification({
        text: "Failed to upgrade project",
        type: "error"
      });
    }
  };

  const isAdmin = membership?.roles.includes(ProjectMembershipRole.Admin);
  return (
    <div className="mt-4 flex max-w-2xl flex-col rounded-lg border border-primary/50 bg-primary/10 px-6 py-5">
      {isUpgrading && (
        <div className="absolute top-0 left-0 z-50 flex h-screen w-screen items-center justify-center bg-bunker-500 bg-opacity-80">
          <Spinner size="lg" className="text-primary" />
          <div className="ml-4 flex flex-col space-y-1">
            <div className="text-3xl font-medium">Please wait</div>
            <span className="inline-block">Upgrading your project...</span>
          </div>
        </div>
      )}
      <div className="mb-4 flex items-start gap-2">
        <FontAwesomeIcon icon={faWarning} size="xl" className="mt-1 text-primary" />
        <p className="text-xl font-semibold">
          Secrets Dashboard no longer supports your project version
        </p>
      </div>
      <p className="mx-1 mb-4 leading-7 text-mineshaft-300">
        While you can still access your project&apos;s secrets through the API, Infisical encourages
        you to upgrade your project to continue using the Dashboard experience.
      </p>
      <p className="mx-1 mb-4 leading-7 text-mineshaft-300">
        Upgrading your project uses Infisical&apos;s new secrets engine, which is 10x faster and
        allows you to encrypt secrets with your own KMS.
      </p>
      <p className="mx-1 mb-6 leading-7 text-mineshaft-300">
        This update should only take a few moments and cannot be ran in the background.
      </p>
      <Button
        onClick={() => handlePopUpOpen("migrationInfo")}
        isDisabled={!isAdmin || isUpgrading}
        isLoading={migrateProjectToV3.isLoading}
        className="w-full "
      >
        {isAdmin ? "Upgrade Project" : "Upgrade requires admin privilege"}
      </Button>
      {didProjectUpgradeFailed && (
        <p className="mt-2 text-sm leading-7 text-red-400">
          <FontAwesomeIcon icon={faTriangleExclamation} className="mr-2" />
          Project upgrade unsuccessful. For assistance, please contact the Infisical support team.
        </p>
      )}
      <Modal
        isOpen={popUp.migrationInfo.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("migrationInfo", isOpen)}
      >
        <ModalContent
          title="Upgrade Checklist"
          subTitle="To ensure smooth transition, please ensure the following requirements are met before upgrading this project."
        >
          <div>
            <form onSubmit={handleSubmit(handleMigrationSecretV2)}>
              <div className="flex flex-col space-y-4">
                <Controller
                  control={control}
                  name="isCLIChecked"
                  defaultValue={false}
                  render={({ field: { onBlur, value, onChange }, fieldState: { error } }) => (
                    <Checkbox
                      id="is-cli-checked"
                      isChecked={value}
                      onCheckedChange={onChange}
                      onBlur={onBlur}
                      isError={Boolean(error?.message)}
                    >
                      Infisical CLI version is v0.25.0 or above.
                    </Checkbox>
                  )}
                />
                <Controller
                  control={control}
                  name="isOperatorChecked"
                  defaultValue={false}
                  render={({ field: { onBlur, value, onChange }, fieldState: { error } }) => (
                    <Checkbox
                      id="is-operator-checked"
                      isChecked={value}
                      onCheckedChange={onChange}
                      onBlur={onBlur}
                      isError={Boolean(error?.message)}
                    >
                      Infisical Kubernetes Operator version is v0.7.0 or above.
                    </Checkbox>
                  )}
                />
                <Controller
                  control={control}
                  name="shouldCloseOpenApprovals"
                  defaultValue={false}
                  render={({ field: { onBlur, value, onChange }, fieldState: { error } }) => (
                    <Checkbox
                      id="is-approvals-checked"
                      isChecked={value}
                      onCheckedChange={onChange}
                      onBlur={onBlur}
                      isError={Boolean(error?.message)}
                    >
                      Close/merge all open approval/access requests.
                    </Checkbox>
                  )}
                />
              </div>
              <div className="mt-8 flex space-x-4">
                <Button type="submit">Confirm Upgrade</Button>
                <Button variant="outline_bg" onClick={() => handlePopUpToggle("migrationInfo")}>
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </ModalContent>
      </Modal>
    </div>
  );
};
