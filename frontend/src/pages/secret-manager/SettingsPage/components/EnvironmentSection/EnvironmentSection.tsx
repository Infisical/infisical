import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { PermissionDeniedBanner, ProjectPermissionCan } from "@app/components/permissions";
import { Button, DeleteActionModal } from "@app/components/v2";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useProject,
  useProjectPermission,
  useSubscription
} from "@app/context";
import { useDeleteWsEnvironment } from "@app/hooks/api";
import { SubscriptionProductCategory } from "@app/hooks/api/subscriptions/types";
import { usePopUp } from "@app/hooks/usePopUp";

import { AddEnvironmentModal } from "./AddEnvironmentModal";
import { EnvironmentTable } from "./EnvironmentTable";
import { UpdateEnvironmentModal } from "./UpdateEnvironmentModal";

export const EnvironmentSection = () => {
  const { subscription } = useSubscription();
  const { currentProject } = useProject();
  const { permission } = useProjectPermission();

  const deleteWsEnvironment = useDeleteWsEnvironment();

  const environmentLimit =
    subscription.get(SubscriptionProductCategory.SecretManager, "environmentLimit") || 0;
  const isMoreEnvironmentsAllowed =
    environmentLimit && currentProject?.environments
      ? currentProject.environments.length <= environmentLimit
      : true;

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "createEnv",
    "updateEnv",
    "deleteEnv",
    "upgradePlan"
  ] as const);

  const onEnvDeleteSubmit = async (id: string) => {
    if (!currentProject?.id) return;

    await deleteWsEnvironment.mutateAsync({
      projectId: currentProject.id,
      id
    });

    createNotification({
      text: "Successfully deleted environment",
      type: "success"
    });

    handlePopUpClose("deleteEnv");
  };

  return (
    <div
      id="environments"
      className="mb-6 scroll-m-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4"
    >
      <div className="mb-8 flex justify-between">
        <p className="text-xl font-medium text-mineshaft-100">Environments</p>
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
        isOpen={popUp.createEnv.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("createEnv", isOpen)}
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
        text="You have reached the maximum number of environments allowed on the free plan. Upgrade to Infisical Pro plan to add more environments."
      />
    </div>
  );
};
