import { useRouter } from "next/router";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { ProjectPermissionCan } from "@app/components/permissions";
import { 
  Button, 
  DeleteActionModal,
} from "@app/components/v2";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useOrganization,
  useWorkspace
} from "@app/context";
import { useToggle } from "@app/hooks";
import { useDeleteWorkspace } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

export const DeleteProjectSection = () => {
  const router = useRouter();
  const { createNotification } = useNotificationContext();
  const { popUp, handlePopUpOpen, handlePopUpClose,  handlePopUpToggle } = usePopUp([
    "deleteWorkspace"
] as const);

  const { currentOrg } = useOrganization();
  const { currentWorkspace } = useWorkspace();
  const [isDeleting, setIsDeleting] = useToggle();
  const deleteWorkspace = useDeleteWorkspace();
  
  const handleDeleteWorkspaceSubmit = async () => {
    setIsDeleting.on();
    try {
      if (!currentWorkspace?._id) return;
      
      await deleteWorkspace.mutateAsync({
        workspaceID: currentWorkspace?._id
      });
      
      createNotification({
        text: "Successfully deleted project",
        type: "success"
      });
      
      router.push(`/org/${currentOrg?._id}/overview`);
      handlePopUpClose("deleteWorkspace");
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to delete project",
        type: "error"
      });
    } finally {
      setIsDeleting.off();
    }
  }

  return (
    <div className="p-4 bg-mineshaft-900 rounded-lg border border-mineshaft-600 mb-6">
        <p className="text-xl font-semibold text-mineshaft-100 mb-4">
            Danger Zone
        </p>
        <ProjectPermissionCan I={ProjectPermissionActions.Delete} a={ProjectPermissionSub.Workspace}>
          {(isAllowed) => (
            <Button
                isLoading={isDeleting}
                isDisabled={!isAllowed || isDeleting}
                colorSchema="danger"
                variant="outline_bg"
                type="submit"
                onClick={() => handlePopUpOpen("deleteWorkspace")}
            >
                {`Delete ${currentWorkspace?.name}`}
            </Button>
          )}
        </ProjectPermissionCan>
        <DeleteActionModal
            isOpen={popUp.deleteWorkspace.isOpen}
            title="Are you sure want to delete this project?"
            subTitle={`Permanently delete ${currentWorkspace?.name} and all of its data. This action is not reversible, so please be careful.`}
            onChange={(isOpen) => handlePopUpToggle("deleteWorkspace", isOpen)}
            deleteKey="confirm"
            buttonText="Delete Project"
            onDeleteApproved={handleDeleteWorkspaceSubmit}
        />
    </div>
  );
};
