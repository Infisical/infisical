import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { Button, DeleteActionModal } from "@app/components/v2";
import { LeaveProjectModal } from "@app/components/v2/LeaveProjectModal";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useOrganization,
  useProjectPermission,
  useWorkspace
} from "@app/context";
import { useToggle } from "@app/hooks";
import { useDeleteWorkspace, useGetWorkspaceUsers, useLeaveProject } from "@app/hooks/api";
import { ProjectType } from "@app/hooks/api/workspace/types";
import { usePopUp } from "@app/hooks/usePopUp";

export const DeleteProjectSection = () => {
  const navigate = useNavigate();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "deleteWorkspace",
    "leaveWorkspace"
  ] as const);

  const { currentOrg } = useOrganization();
  const { hasProjectRole, membership } = useProjectPermission();
  const { currentWorkspace } = useWorkspace();
  const [isDeleting, setIsDeleting] = useToggle();
  const [isLeaving, setIsLeaving] = useToggle();
  const deleteWorkspace = useDeleteWorkspace();
  const leaveProject = useLeaveProject();
  const { data: members, isPending: isMembersLoading } = useGetWorkspaceUsers(
    currentWorkspace?.id || ""
  );

  // If isNoAccessMember is true, then the user can't read the workspace members. So we need to handle this case separately.
  const isNoAccessMember = hasProjectRole("no-access");

  const isOnlyAdminMember = useMemo(() => {
    if (!members || !membership || !hasProjectRole("admin")) return false;

    const adminMembers = members.filter(
      (member) => member.roles.map((r) => r.role).includes("admin") && member.id !== membership.id // exclude the current user
    );

    return !adminMembers.length;
  }, [members, membership]);

  const handleDeleteWorkspaceSubmit = async () => {
    setIsDeleting.on();
    try {
      if (!currentWorkspace?.id) return;

      await deleteWorkspace.mutateAsync({
        workspaceID: currentWorkspace?.id
      });

      createNotification({
        text: "Successfully deleted project",
        type: "success"
      });

      navigate({
        to: `/organization/${ProjectType.SecretManager}/overview` as const
      });
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
  };

  const handleLeaveWorkspaceSubmit = async () => {
    try {
      setIsLeaving.on();

      if (!currentWorkspace?.id || !currentOrg?.id) return;

      // If there's no members, and the user has access to read members, something went wrong.
      if (!members && !isNoAccessMember) return;

      // If the user has elevated permissions and can read members:
      if (!isNoAccessMember) {
        if (!members) return;

        if (members.length < 2) {
          createNotification({
            text: "You can't leave the project as you are the only member",
            type: "error"
          });
          return;
        }
        // If the user has access to read members, and there's less than 1 admin member excluding the current user, they can't leave the project.
        if (isOnlyAdminMember) {
          createNotification({
            text: "You can't leave a project with no admin members left. Promote another member to admin first.",
            type: "error"
          });
          return;
        }
      }

      // If it's actually a no-access member, then we don't really care about the members.

      await leaveProject.mutateAsync({
        workspaceId: currentWorkspace.id
      });

      navigate({
        to: `/organization/${ProjectType.SecretManager}/overview` as const
      });
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to leave project",
        type: "error"
      });
    } finally {
      setIsLeaving.off();
    }
  };

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <p className="mb-4 text-xl font-semibold text-mineshaft-100">Danger Zone</p>
      <div className="space-x-4">
        <ProjectPermissionCan I={ProjectPermissionActions.Delete} a={ProjectPermissionSub.Project}>
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
        {!isOnlyAdminMember && (
          <Button
            disabled={isMembersLoading || (members && members?.length < 2)}
            isLoading={isLeaving}
            colorSchema="danger"
            variant="outline_bg"
            type="submit"
            onClick={() => handlePopUpOpen("leaveWorkspace")}
          >
            {`Leave ${currentWorkspace?.name}`}
          </Button>
        )}
      </div>

      <DeleteActionModal
        isOpen={popUp.deleteWorkspace.isOpen}
        title="Are you sure you want to delete this project?"
        subTitle={`Permanently delete ${currentWorkspace?.name} and all of its data. This action is not reversible, so please be careful.`}
        onChange={(isOpen) => handlePopUpToggle("deleteWorkspace", isOpen)}
        deleteKey="confirm"
        buttonText="Delete Project"
        onDeleteApproved={handleDeleteWorkspaceSubmit}
      />

      <LeaveProjectModal
        isOpen={popUp.leaveWorkspace.isOpen}
        title="Are you sure you want to leave this project?"
        subTitle={`If you leave ${currentWorkspace?.name} you will lose access to the project and its contents.`}
        onChange={(isOpen) => handlePopUpToggle("leaveWorkspace", isOpen)}
        deleteKey="confirm"
        buttonText="Leave Project"
        onLeaveApproved={handleLeaveWorkspaceSubmit}
      />
    </div>
  );
};
