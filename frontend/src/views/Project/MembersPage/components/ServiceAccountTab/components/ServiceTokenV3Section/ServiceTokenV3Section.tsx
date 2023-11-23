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
  useDeleteServiceFromWorkspace
} from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

import { AddServiceTokenV3Modal } from "./AddServiceTokenV3Modal";
import { ServiceTokenV3Table } from "./ServiceTokenV3Table";

export const ServiceTokenV3Section = withProjectPermission(
  () => {
    const { createNotification } = useNotificationContext();
    const { currentWorkspace } = useWorkspace();

    const workspaceId = currentWorkspace?._id ?? "";

    const { mutateAsync: deleteMutateAsync } = useDeleteServiceFromWorkspace();
    
    const { popUp, handlePopUpOpen, handlePopUpClose,  handlePopUpToggle } = usePopUp([
      "serviceTokenV3",
      "deleteServiceTokenV3",
      "upgradePlan"
    ] as const);
    
    const onRemoveServiceTokenDataSubmit = async (serviceTokenDataId: string) => {
      try {

        await deleteMutateAsync({
          serviceId: serviceTokenDataId,
          workspaceId
        });
        
        createNotification({
            text: "Successfully removed service account from project",
            type: "success"
        });
        
        handlePopUpClose("deleteServiceTokenV3");
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
              Service Accounts (Beta)
            </p>
            <ProjectPermissionCan
              I={ProjectPermissionActions.Create}
              a={ProjectPermissionSub.ServiceTokens}
            >
              {(isAllowed) => (
                <Button
                  colorSchema="secondary"
                  type="submit"
                  leftIcon={<FontAwesomeIcon icon={faPlus} />}
                  onClick={() => handlePopUpOpen("serviceTokenV3")}
                  isDisabled={!isAllowed}
                >
                  Add service account
                </Button>
              )}
            </ProjectPermissionCan>
          </div>
          <ServiceTokenV3Table 
            handlePopUpOpen={handlePopUpOpen}
          />
          <AddServiceTokenV3Modal 
            popUp={popUp}
            handlePopUpOpen={handlePopUpOpen}
            handlePopUpToggle={handlePopUpToggle}
          />
          <DeleteActionModal
            isOpen={popUp.deleteServiceTokenV3.isOpen}
            title={`Are you sure want to remove ${
              (popUp?.deleteServiceTokenV3?.data as { name: string })?.name || ""
            } from the project?`}
            onChange={(isOpen) => handlePopUpToggle("deleteServiceTokenV3", isOpen)}
            deleteKey="confirm"
            onDeleteApproved={() => 
              onRemoveServiceTokenDataSubmit(
                (popUp?.deleteServiceTokenV3?.data as { serviceTokenDataId: string })?.serviceTokenDataId
              )
            }
          />
        </div>
    );
  },
  { action: ProjectPermissionActions.Read, subject: ProjectPermissionSub.ServiceTokens }
);