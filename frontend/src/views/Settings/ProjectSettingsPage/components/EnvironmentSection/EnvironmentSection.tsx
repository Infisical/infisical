import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import {
  Button,
  DeleteActionModal,
  UpgradePlanModal
} from "@app/components/v2";
import { useSubscription,useWorkspace } from "@app/context";
import {
  useDeleteWsEnvironment
} from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

import { AddEnvironmentModal } from "./AddEnvironmentModal";
import { EnvironmentTable } from "./EnvironmentTable";
import { UpdateEnvironmentModal } from "./UpdateEnvironmentModal";

export const EnvironmentSection = () => {
  const { createNotification } = useNotificationContext();
  const { subscription } = useSubscription();
  const { currentWorkspace } = useWorkspace();

  const deleteWsEnvironment = useDeleteWsEnvironment();

  const isMoreEnvironmentsAllowed = (subscription?.environmentLimit && currentWorkspace?.environments) ? (currentWorkspace.environments.length < subscription.environmentLimit) : true;
  
  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "createEnv",
    "updateEnv",
    "deleteEnv",
    "upgradePlan"
  ] as const);

  const onEnvDeleteSubmit = async (environmentSlug: string) => {
    try {
      if (!currentWorkspace?._id) return;
      
      await deleteWsEnvironment.mutateAsync({
        workspaceID: currentWorkspace._id,
        environmentSlug
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
    <div className="mb-6 p-4 bg-mineshaft-900 rounded-lg border border-mineshaft-600">
      <div className="flex justify-between mb-8">
        <p className="text-xl font-semibold text-mineshaft-100">
          Environments
        </p>
        <div>
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
          >
            Create environment
          </Button>
        </div>
      </div>
      <p className="text-gray-400 mb-8">
        Choose which environments will show up in your dashboard like development, staging, production
      </p>
      <EnvironmentTable 
        handlePopUpOpen={handlePopUpOpen}
      />
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
        onDeleteApproved={() =>
          onEnvDeleteSubmit((popUp?.deleteEnv?.data as { slug: string })?.slug)
        }
      />
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text="You can add custom environments if you switch to Infisical's Team plan."
      />
    </div>
  );
};
