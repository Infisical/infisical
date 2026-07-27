import { useNavigate } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { Button, DeleteActionModal, Tooltip } from "@app/components/v2";
import { LeaveProjectModal } from "@app/components/v2/LeaveProjectModal";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useOrganization,
  useProject,
  useProjectPermission
} from "@app/context";
import { useToggle } from "@app/hooks";
import { useDeleteWorkspace, useLeaveProject } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

export const DeleteProjectSection = () => {
  const navigate = useNavigate();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "deleteWorkspace",
    "leaveWorkspace"
  ] as const);

  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const { memberships } = useProjectPermission();
  const isDirectMember = Boolean(memberships?.some((membership) => !membership.actorGroupId));
  const [isDeleting, setIsDeleting] = useToggle();
  const [isLeaving, setIsLeaving] = useToggle();
  const deleteWorkspace = useDeleteWorkspace();
  const leaveProject = useLeaveProject();

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
      if (!currentProject) return;

      setIsLeaving.on();

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
        <Tooltip
          content="You're a member through a group. Leave the group to remove access."
          isDisabled={isDirectMember}
        >
          <span>
            <Button
              isLoading={isLeaving}
              isDisabled={!isDirectMember}
              colorSchema="danger"
              variant="outline_bg"
              type="submit"
              onClick={() => handlePopUpOpen("leaveWorkspace")}
            >
              {`Leave ${currentProject?.name}`}
            </Button>
          </span>
        </Tooltip>
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
