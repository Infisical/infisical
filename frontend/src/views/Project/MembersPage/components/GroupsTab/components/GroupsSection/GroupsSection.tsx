import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
    Button,
    DeleteActionModal
} from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub,useWorkspace } from "@app/context";
import { usePopUp } from "@app/hooks";
import { useDeleteGroupFromWorkspace } from "@app/hooks/api";

import { GroupModal } from "./GroupModal";
import { GroupTable } from "./GroupsTable";

export const GroupsSection = () => {
    const { createNotification } = useNotificationContext();
    const { currentWorkspace } = useWorkspace();

    const workspaceId = currentWorkspace?.id ?? "";
    
    const { mutateAsync: deleteMutateAsync } = useDeleteGroupFromWorkspace();
    
    const { handlePopUpToggle, popUp, handlePopUpOpen, handlePopUpClose } = usePopUp([
        "group",
        "deleteGroup",
        "upgradePlan"
    ] as const);

    const onRemoveGroupSubmit = async (groupSlug: string) => {
        try {
            await deleteMutateAsync({
                groupSlug,
                workspaceId
            });
  
            createNotification({
                text: "Successfully removed identity from project",
                type: "success"
            });
  
          handlePopUpClose("deleteGroup");
        } catch (err) {
            console.error(err);
            const error = err as any;
            const text = error?.response?.data?.message ?? "Failed to remove group from project";
    
            createNotification({
                text,
                type: "error"
            });
        }
    };
      
    return (
        <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
            <div className="mb-4 flex items-center justify-between">
                <p className="text-xl font-semibold text-mineshaft-100">Groups</p>
                <ProjectPermissionCan I={ProjectPermissionActions.Create} a={ProjectPermissionSub.Groups}>
                    {(isAllowed) => (
                        <Button
                            colorSchema="primary"
                            type="submit"
                            leftIcon={<FontAwesomeIcon icon={faPlus} />}
                            onClick={() => handlePopUpOpen("group")}
                            isDisabled={!isAllowed}
                        >
                            Add Group
                        </Button>
                    )}
                </ProjectPermissionCan>
            </div>
            <GroupModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
            <GroupTable handlePopUpOpen={handlePopUpOpen} />
            <DeleteActionModal
                isOpen={popUp.deleteGroup.isOpen}
                title={`Are you sure want to remove the group ${
                    (popUp?.deleteGroup?.data as { name: string })?.name || ""
                } from the project?`}
                onChange={(isOpen) => handlePopUpToggle("deleteGroup", isOpen)}
                deleteKey="confirm"
                onDeleteApproved={() =>
                    onRemoveGroupSubmit(
                        (popUp?.deleteGroup?.data as { slug: string })?.slug
                    )
                }
            />
        </div>
    );
}