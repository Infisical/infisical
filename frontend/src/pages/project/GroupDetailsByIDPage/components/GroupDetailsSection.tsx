import { faEllipsisV, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  DeleteActionModal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton
} from "@app/components/v2";
import { CopyButton } from "@app/components/v2/CopyButton";
import { ProjectPermissionActions, ProjectPermissionSub, useWorkspace } from "@app/context";
import { getProjectBaseURL } from "@app/helpers/project";
import { usePopUp } from "@app/hooks";
import { useDeleteGroupFromWorkspace } from "@app/hooks/api";
import { TGroupMembership } from "@app/hooks/api/groups/types";
import { GroupRoles } from "@app/pages/project/AccessControlPage/components/GroupsTab/components/GroupsSection/GroupRoles";

type Props = {
  groupMembership: TGroupMembership;
};

export const GroupDetailsSection = ({ groupMembership }: Props) => {
  const { handlePopUpToggle, popUp, handlePopUpClose, handlePopUpOpen } = usePopUp([
    "deleteGroup"
  ] as const);

  const { mutateAsync: deleteMutateAsync } = useDeleteGroupFromWorkspace();
  const { currentWorkspace } = useWorkspace();
  const navigate = useNavigate();

  const onRemoveGroupSubmit = async () => {
    try {
      await deleteMutateAsync({
        groupId: groupMembership.group.id,
        projectId: currentWorkspace.id
      });

      createNotification({
        text: "Successfully removed group from project",
        type: "success"
      });

      navigate({
        to: `${getProjectBaseURL(currentWorkspace.type)}/access-management`,
        params: {
          projectId: currentWorkspace.id
        },
        search: {
          selectedTab: "groups"
        }
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
    <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-4">
        <h3 className="text-lg font-semibold text-mineshaft-100">Group Details</h3>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton ariaLabel="Options" colorSchema="secondary" className="w-6" variant="plain">
              <FontAwesomeIcon icon={faEllipsisV} />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent sideOffset={2} align="end">
            <ProjectPermissionCan
              I={ProjectPermissionActions.Delete}
              a={ProjectPermissionSub.Groups}
            >
              {(isAllowed) => {
                return (
                  <DropdownMenuItem
                    icon={<FontAwesomeIcon icon={faTrash} />}
                    onClick={() => handlePopUpOpen("deleteGroup")}
                    isDisabled={!isAllowed}
                  >
                    Remove Group From Project
                  </DropdownMenuItem>
                );
              }}
            </ProjectPermissionCan>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="pt-4">
        <div className="mb-4">
          <p className="text-sm font-semibold text-mineshaft-300">Group ID</p>
          <div className="group flex items-center gap-2">
            <p className="text-sm text-mineshaft-300">{groupMembership.group.id}</p>
            <CopyButton
              value={groupMembership.group.id}
              name="Group ID"
              size="xs"
              variant="plain"
            />
          </div>
        </div>
        <div className="mb-4">
          <p className="text-sm font-semibold text-mineshaft-300">Name</p>
          <p className="text-sm text-mineshaft-300">{groupMembership.group.name}</p>
        </div>
        <div className="mb-4">
          <p className="text-sm font-semibold text-mineshaft-300">Slug</p>
          <div className="group flex items-center gap-2">
            <p className="text-sm text-mineshaft-300">{groupMembership.group.slug}</p>
            <CopyButton value={groupMembership.group.slug} name="Slug" size="xs" variant="plain" />
          </div>
        </div>
        <div className="mb-4">
          <p className="text-sm font-semibold text-mineshaft-300">Project Role</p>
          <ProjectPermissionCan I={ProjectPermissionActions.Edit} a={ProjectPermissionSub.Groups}>
            {(isAllowed) => (
              <GroupRoles
                className="mt-1"
                popperContentProps={{ side: "right" }}
                roles={groupMembership.roles}
                groupId={groupMembership.group.id}
                disableEdit={!isAllowed}
              />
            )}
          </ProjectPermissionCan>
        </div>
        <div className="mb-4">
          <p className="text-sm font-semibold text-mineshaft-300">Assigned to Project</p>
          <p className="text-sm text-mineshaft-300">
            {format(groupMembership.createdAt, "M/d/yyyy")}
          </p>
        </div>
      </div>
      <DeleteActionModal
        isOpen={popUp.deleteGroup.isOpen}
        title={`Are you sure you want to remove the group ${
          groupMembership.group.name
        } from the project?`}
        onChange={(isOpen) => handlePopUpToggle("deleteGroup", isOpen)}
        deleteKey="confirm"
        buttonText="Remove"
        onDeleteApproved={onRemoveGroupSubmit}
      />
    </div>
  );
};
