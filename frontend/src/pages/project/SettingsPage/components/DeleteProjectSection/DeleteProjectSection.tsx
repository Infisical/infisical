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
  useProject,
  useProjectPermission,
  useUser
} from "@app/context";
import { useToggle } from "@app/hooks";
import { useDeleteWorkspace, useGetWorkspaceUsers, useLeaveProject } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

export const DeleteProjectSection = () => {
  const navigate = useNavigate();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "deleteWorkspace",
    "leaveWorkspace"
  ] as const);

  const { user } = useUser();
  const { currentOrg } = useOrganization();
  const { hasProjectRole } = useProjectPermission();
  const { currentProject } = useProject();
  const [isDeleting, setIsDeleting] = useToggle();
  const [isLeaving, setIsLeaving] = useToggle();
  const deleteWorkspace = useDeleteWorkspace();
  const leaveProject = useLeaveProject();
  const { data: members, isPending: isMembersLoading } = useGetWorkspaceUsers(
    currentProject?.id || ""
  );

  // If isNoAccessMember is true, then the user can't read the workspace members. So we need to handle this case separately.
  const isNoAccessMember = hasProjectRole("no-access");

  const isOnlyAdminMember = useMemo(() => {
    if (!members || !hasProjectRole("admin")) return false;

    const adminMembers = members.filter(
      (member) => member.roles.map((r) => r.role).includes("admin") && member.user.id !== user.id // exclude the current user
    );

    return !adminMembers.length;
  }, [members, user]);

  const handleDeleteWorkspaceSubmit = async () => {
    setIsDeleting.on();
    try {
      if (!currentProject?.id) return;

      await deleteWorkspace.mutateAsync({
        projectID: currentProject?.id
      });

      createNotification({
        text: "Successfully deleted project",
        type: "success"
      });

      navigate({
        to: "/organizations/$orgId/projects",
        params: { orgId: currentOrg.id }
      });
      handlePopUpClose("deleteWorkspace");
    } finally {
      setIsDeleting.off();
    }
  };

  const handleLeaveWorkspaceSubmit = async () => {
    try {
      setIsLeaving.on();

      if (!currentProject?.id || !currentOrg?.id) return;

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
        projectId: currentProject.id
      });

      navigate({
        to: "/organizations/$orgId/projects",
        params: { orgId: currentOrg.id }
      });
    } finally {
      setIsLeaving.off();
    }
  };

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <p className="mb-4 text-xl font-medium text-mineshaft-100">Danger Zone</p>
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
              {`Delete ${currentProject?.name}`}
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
            {`Leave ${currentProject?.name}`}
          </Button>
        )}
      </div>

      <DeleteActionModal
        isOpen={popUp.deleteWorkspace.isOpen}
        title="Are you sure you want to delete this project?"
        subTitle={`Permanently delete ${currentProject?.name} and all of its data. This action is not reversible, so please be careful.`}
        onChange={(isOpen) => handlePopUpToggle("deleteWorkspace", isOpen)}
        deleteKey="confirm"
        buttonText="Delete Project"
        onDeleteApproved={handleDeleteWorkspaceSubmit}
      />

      <LeaveProjectModal
        isOpen={popUp.leaveWorkspace.isOpen}
        title="Are you sure you want to leave this project?"
        subTitle={`If you leave ${currentProject?.name} you will lose access to the project and its contents.`}
        onChange={(isOpen) => handlePopUpToggle("leaveWorkspace", isOpen)}
        deleteKey="confirm"
        buttonText="Leave Project"
        onLeaveApproved={handleLeaveWorkspaceSubmit}
      />
    </div>
  );
};
