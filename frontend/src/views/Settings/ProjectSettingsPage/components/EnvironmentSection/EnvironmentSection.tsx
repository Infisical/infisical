import { useState } from "react";
import { faMagnifyingGlass,faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { PermissionDeniedBanner, ProjectPermissionCan } from "@app/components/permissions";
import { Button, DeleteActionModal, Input, UpgradePlanModal } from "@app/components/v2";
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

// TODO: resolve strange subtitle spacing / design
// TODO: resolve filtering stuff

export const EnvironmentSection = () => {
  const { createNotification } = useNotificationContext();
  const { subscription } = useSubscription();
  const { currentWorkspace } = useWorkspace();
  const { permission } = useProjectPermission();
  const [searchEnv, setSearchEnv] = useState("");

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
    <div id="environments">
      <hr className="border-mineshaft-600" />
      <p className="pt-4 text-md text-mineshaft-100">Environments</p>
      <p className="pt-4 text-sm text-mineshaft-300">
        Choose which environments will show up in your dashboard like development, staging,
        production
      </p>
      <div className="flex pt-4">
        <Input
          value={searchEnv}
          onChange={(e) => setSearchEnv(e.target.value)}
          leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
          placeholder="Search environments by name/slug..."
        />
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
                className="ml-4"
              >
                Create
              </Button>
            )}
          </ProjectPermissionCan>
      </div>
      <div className="py-4">
        {permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.Environments) ? (
          <EnvironmentTable handlePopUpOpen={handlePopUpOpen} />
        ) : (
          <PermissionDeniedBanner />
        )}
      </div>
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
        title={`Are you sure want to delete ${
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
