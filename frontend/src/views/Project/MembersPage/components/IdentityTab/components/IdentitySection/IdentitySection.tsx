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
import { useDeleteIdentityFromWorkspace } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

import { IdentityModal } from "./IdentityModal";
import { IdentityTable } from "./IdentityTable";

export const IdentitySection = withProjectPermission(
  () => {
    const { createNotification } = useNotificationContext();
    const { currentWorkspace } = useWorkspace();

    const workspaceId = currentWorkspace?._id ?? "";

    const { mutateAsync: deleteMutateAsync } = useDeleteIdentityFromWorkspace();
    
    const { popUp, handlePopUpOpen, handlePopUpClose,  handlePopUpToggle } = usePopUp([
      "identity",
      "deleteIdentity",
      "upgradePlan"
    ] as const);
    
    const onRemoveIdentitySubmit = async (identityId: string) => {
      try {

        await deleteMutateAsync({
            identityId,
            workspaceId
        });

        createNotification({
            text: "Successfully removed identity from project",
            type: "success"
        });
        
        handlePopUpClose("deleteIdentity");
      } catch (err) {
        console.error(err);
        const error = err as any;
        const text = error?.response?.data?.message ?? "Failed to remove identity from project"
        
        createNotification({
            text,
            type: "error"
        });
      }
    }

    return (
        <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
          <div className="flex justify-between mb-8">
            <p className="text-xl font-semibold text-mineshaft-100">
                Identities
            </p>
            <ProjectPermissionCan
              I={ProjectPermissionActions.Create}
              a={ProjectPermissionSub.Identity}
            >
              {(isAllowed) => (
                <Button
                  colorSchema="secondary"
                  type="submit"
                  leftIcon={<FontAwesomeIcon icon={faPlus} />}
                  onClick={() => handlePopUpOpen("identity")}
                  isDisabled={!isAllowed}
                >
                  Add identity
                </Button>
              )}
            </ProjectPermissionCan>
          </div>
            <IdentityTable 
                handlePopUpOpen={handlePopUpOpen}
            />
            <IdentityModal 
                popUp={popUp}
                handlePopUpToggle={handlePopUpToggle}
            />
          <DeleteActionModal
            isOpen={popUp.deleteIdentity.isOpen}
            title={`Are you sure want to remove ${
              (popUp?.deleteIdentity?.data as { name: string })?.name || ""
            } from the project?`}
            onChange={(isOpen) => handlePopUpToggle("deleteIdentity", isOpen)}
            deleteKey="confirm"
            onDeleteApproved={() => 
              onRemoveIdentitySubmit(
                (popUp?.deleteIdentity?.data as { identityId: string })?.identityId
              )
            }
          />
        </div>
    );
  },
  { action: ProjectPermissionActions.Read, subject: ProjectPermissionSub.Identity }
);