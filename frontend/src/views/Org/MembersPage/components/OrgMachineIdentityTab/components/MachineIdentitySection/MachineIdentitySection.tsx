import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { OrgPermissionCan } from "@app/components/permissions";
import { 
  Button,
  DeleteActionModal
} from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/context";
import { withPermission } from "@app/hoc";
import { useDeleteMachineIdentity } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

import { AddMachineIdentityModal } from "./AddMachineIdentityModal";
import { CreateClientSecretModal } from "./CreateClientSecretModal";
import { MachineIdentityTable } from "./MachineIdentityTable";

export const MachineIdentitySection = withPermission(
  () => {
    const { createNotification } = useNotificationContext();
    const { mutateAsync: deleteMutateAsync } = useDeleteMachineIdentity();
    const { popUp, handlePopUpOpen, handlePopUpClose,  handlePopUpToggle } = usePopUp([
      "machineIdentity",
      "deleteMachineIdentity",
      "clientSecret",
      "upgradePlan"
    ] as const);
    
    const onDeleteMachineIdentitySubmit = async (machineId: string) => {
      try {
        await deleteMutateAsync({
          machineId 
        });
        createNotification({
            text: "Successfully deleted machine identity",
            type: "success"
        });
        
        handlePopUpClose("deleteMachineIdentity");
      } catch (err) {
          console.error(err);
          createNotification({
              text: "Failed to delete machine identity",
              type: "error"
          });
      }
    }

    return (
        <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
          <div className="flex justify-between mb-8">
            <p className="text-xl font-semibold text-mineshaft-100">
              App Clients
            </p>
            <OrgPermissionCan
              I={OrgPermissionActions.Create}
              a={OrgPermissionSubjects.MachineIdentity}
            >
              {(isAllowed) => (
                <Button
                  colorSchema="secondary"
                  type="submit"
                  leftIcon={<FontAwesomeIcon icon={faPlus} />}
                  onClick={() => handlePopUpOpen("machineIdentity")}
                  isDisabled={!isAllowed}
                >
                  Create client
                </Button>
              )}
            </OrgPermissionCan>
          </div>
          <MachineIdentityTable 
            handlePopUpOpen={handlePopUpOpen}
          />
          <AddMachineIdentityModal 
            popUp={popUp}
            handlePopUpOpen={handlePopUpOpen}
            handlePopUpToggle={handlePopUpToggle}
          />
          <CreateClientSecretModal 
            popUp={popUp}
            handlePopUpToggle={handlePopUpToggle}
          />
          <DeleteActionModal
            isOpen={popUp.deleteMachineIdentity.isOpen}
            title={`Are you sure want to delete ${
              (popUp?.deleteMachineIdentity?.data as { name: string })?.name || ""
            }?`}
            onChange={(isOpen) => handlePopUpToggle("deleteMachineIdentity", isOpen)}
            deleteKey="confirm"
            onDeleteApproved={() => 
              onDeleteMachineIdentitySubmit(
                (popUp?.deleteMachineIdentity?.data as { machineId: string })?.machineId
              )
            }
          />
        </div>
    );
  },
  { action: OrgPermissionActions.Read, subject: OrgPermissionSubjects.MachineIdentity }
);