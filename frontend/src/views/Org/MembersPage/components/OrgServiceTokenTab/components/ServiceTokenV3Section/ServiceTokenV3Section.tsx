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
import {
  useDeleteServiceTokenV3
} from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

import { AddServiceTokenV3Modal } from "./AddServiceTokenV3Modal";
import { ServiceTokenV3Table } from "./ServiceTokenV3Table";

export const ServiceTokenV3Section = withPermission(
  () => {
    const { createNotification } = useNotificationContext();
    const { mutateAsync: deleteMutateAsync } = useDeleteServiceTokenV3();
    const { popUp, handlePopUpOpen, handlePopUpClose,  handlePopUpToggle } = usePopUp([
      "serviceTokenV3",
      "deleteServiceTokenV3",
      "upgradePlan"
    ] as const);
    
    const onDeleteServiceTokenDataSubmit = async (serviceTokenDataId: string) => {
      try {
        await deleteMutateAsync({
            serviceTokenDataId 
        });
        createNotification({
            text: "Successfully deleted service token v3",
            type: "success"
        });
        
        handlePopUpClose("deleteServiceTokenV3");
      } catch (err) {
          console.error(err);
          createNotification({
              text: "Failed to delete service token v3",
              type: "error"
          });
      }
    }

    return (
        <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
          <div className="flex justify-between mb-8">
            <p className="text-xl font-semibold text-mineshaft-100">
              Machines
            </p>
            <OrgPermissionCan
              I={OrgPermissionActions.Create}
              a={OrgPermissionSubjects.ServiceTokens}
            >
              {(isAllowed) => (
                <Button
                  colorSchema="secondary"
                  type="submit"
                  leftIcon={<FontAwesomeIcon icon={faPlus} />}
                  onClick={() => handlePopUpOpen("serviceTokenV3")}
                  isDisabled={!isAllowed}
                >
                  Create account
                </Button>
              )}
            </OrgPermissionCan>
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
            title={`Are you sure want to delete ${
              (popUp?.deleteServiceTokenV3?.data as { name: string })?.name || ""
            }?`}
            onChange={(isOpen) => handlePopUpToggle("deleteServiceTokenV3", isOpen)}
            deleteKey="confirm"
            onDeleteApproved={() => 
              onDeleteServiceTokenDataSubmit(
                (popUp?.deleteServiceTokenV3?.data as { serviceTokenDataId: string })?.serviceTokenDataId
              )
            }
          />
        </div>
    );
  },
  { action: OrgPermissionActions.Read, subject: OrgPermissionSubjects.ServiceTokens }
);