import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { ProjectPermissionCan } from "@app/components/permissions";
import { 
  Button,
  DeleteActionModal
} from "@app/components/v2";
import { 
  ProjectPermissionActions, 
  ProjectPermissionSub, 
  useWorkspace} from "@app/context";
import { withProjectPermission } from "@app/hoc";
import {
  useDeleteMachineFromWorkspace
} from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

import { AddMachineIdentityModal } from "./AddMachineIdentityModal";
import { MachineIdentityTable } from "./MachineIdentityTable";

export const MachineIdentitySection = withProjectPermission(
  () => {
    const { createNotification } = useNotificationContext();
    const { currentWorkspace } = useWorkspace();

    const workspaceId = currentWorkspace?._id ?? "";

    const { mutateAsync: deleteMutateAsync } = useDeleteMachineFromWorkspace();
    
    const { popUp, handlePopUpOpen, handlePopUpClose,  handlePopUpToggle } = usePopUp([
      "machineIdentity",
      "deleteMachineIdentity",
      "upgradePlan"
    ] as const);
    
    const onRemoveServiceTokenDataSubmit = async (machineId: string) => {
      try {

        await deleteMutateAsync({
          machineId,
          workspaceId
        });
        
        createNotification({
            text: "Successfully removed service account from project",
            type: "success"
        });
        
        handlePopUpClose("deleteMachineIdentity");
      } catch (err) {
          console.error(err);
          createNotification({
              text: "Failed to delete service account from project",
              type: "error"
          });
      }
    }

    return (
        <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
          <div className="flex justify-between mb-8">
            <p className="text-xl font-semibold text-mineshaft-100">
              Machine Identities
            </p>
            <ProjectPermissionCan
              I={ProjectPermissionActions.Create}
              a={ProjectPermissionSub.MachineIdentity}
            >
              {(isAllowed) => (
                <Button
                  colorSchema="secondary"
                  type="submit"
                  leftIcon={<FontAwesomeIcon icon={faPlus} />}
                  onClick={() => handlePopUpOpen("machineIdentity")}
                  isDisabled={!isAllowed}
                >
                  Add identity
                </Button>
              )}
            </ProjectPermissionCan>
          </div>
          <MachineIdentityTable 
            handlePopUpOpen={handlePopUpOpen}
          />
          <AddMachineIdentityModal 
            popUp={popUp}
            handlePopUpToggle={handlePopUpToggle}
          />
          <DeleteActionModal
            isOpen={popUp.deleteMachineIdentity.isOpen}
            title={`Are you sure want to remove ${
              (popUp?.deleteMachineIdentity?.data as { name: string })?.name || ""
            } from the project?`}
            onChange={(isOpen) => handlePopUpToggle("deleteMachineIdentity", isOpen)}
            deleteKey="confirm"
            onDeleteApproved={() => 
              onRemoveServiceTokenDataSubmit(
                (popUp?.deleteMachineIdentity?.data as { machineId: string })?.machineId
              )
            }
          />
        </div>
    );
  },
  { action: ProjectPermissionActions.Read, subject: ProjectPermissionSub.MachineIdentity }
);