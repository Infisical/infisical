import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { PermissionDeniedBanner, ProjectPermissionCan } from "@app/components/permissions";
import { Button, DeleteActionModal } from "@app/components/v2";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useProjectPermission,
  useSubscription,
  useWorkspace
} from "@app/context";
import { useDeleteWsEnvironment } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

import { AddEnvironmentModal } from "./AddEnvironmentModal";
import { EnvironmentTable } from "./EnvironmentTable";
import { UpdateEnvironmentModal } from "./UpdateEnvironmentModal";

export const EnvironmentSection = () => {
  const { subscription } = useSubscription();
  const { currentWorkspace } = useWorkspace();
  const { permission } = useProjectPermission();

  const deleteWsEnvironment = useDeleteWsEnvironment();

  const isMoreEnvironmentsAllowed =
    subscription?.environmentLimit && currentWorkspace?.environments
      ? currentWorkspace.environments.length < subscription.environmentLimit
      : true;

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "createEnv",
    "updateEnv",
    "deleteEnv",
    "upgradePlan"
  ] as const);

  const onEnvDeleteSubmit = async (id: string) => {
    try {
      if (!currentWorkspace?.id) return;

      await deleteWsEnvironment.mutateAsync({
        workspaceId: currentWorkspace.id,
        id
      });

      createNotification({
        text: "Successfully deleted environment",
        type: "success"
      });

      handlePopUpClose("deleteEnv");
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to delete environment",
        type: "error"
      });
    }
  };

  return (
    <div
      id="environments"
      className="mb-6 scroll-m-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4"
    >
      <div className="mb-8 flex justify-between">
        <p className="text-xl font-semibold text-mineshaft-100">Environments</p>
        <div>
          <ProjectPermissionCan
            I={ProjectPermissionActions.Create}
            a={ProjectPermissionSub.Environments}
          >
            {(isAllowed) => (
              <Button
                colorSchema="secondary"
                leftIcon={<FontAwesomeIcon icon={faPlus} />}
                onClick={() => {
                  if (isMoreEnvironmentsAllowed) {
                    handlePopUpOpen("createEnv");
                  } else {
                    handlePopUpOpen("upgradePlan");
                  }
                }}
                isDisabled={!isAllowed}
              >
                Create environment
              </Button>
            )}
          </ProjectPermissionCan>
        </div>
      </div>
      <p className="mb-8 text-gray-400">
        Choose which environments will show up in your dashboard like development, staging,
        production
      </p>
      {permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.Environments) ? (
        <EnvironmentTable handlePopUpOpen={handlePopUpOpen} />
      ) : (
        <PermissionDeniedBanner />
      )}
      <AddEnvironmentModal
        popUp={popUp}
        handlePopUpClose={handlePopUpClose}
        handlePopUpToggle={handlePopUpToggle}
      />
      <UpdateEnvironmentModal
        popUp={popUp}
        handlePopUpClose={handlePopUpClose}
        handlePopUpToggle={handlePopUpToggle}
      />
      <DeleteActionModal
        isOpen={popUp.deleteEnv.isOpen}
        title={`Are you sure you want to delete ${
          (popUp?.deleteEnv?.data as { name: string })?.name || " "
        }?`}
        onChange={(isOpen) => handlePopUpToggle("deleteEnv", isOpen)}
        deleteKey={(popUp?.deleteEnv?.data as { slug: string })?.slug || ""}
        onDeleteApproved={() => onEnvDeleteSubmit((popUp?.deleteEnv?.data as { id: string })?.id)}
      />
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text="You can add custom environments if you switch to Infisical's Team plan."
      />
    </div>
  );
};
