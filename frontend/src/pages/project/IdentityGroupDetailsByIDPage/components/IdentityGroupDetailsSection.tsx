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
import { useDeleteIdentityGroupFromWorkspace } from "@app/hooks/api/workspace";
import { TIdentityGroupMembership } from "@app/hooks/api/identity-groups/types";
import { IdentityGroupRoles } from "@app/pages/project/AccessControlPage/components/IdentityGroupsTab/components/IdentityGroupsSection/IdentityGroupRoles";

type Props = {
  identityGroupMembership: TIdentityGroupMembership;
};

export const IdentityGroupDetailsSection = ({ identityGroupMembership }: Props) => {
  const { handlePopUpToggle, popUp, handlePopUpClose, handlePopUpOpen } = usePopUp([
    "deleteIdentityGroup"
  ] as const);

  const { mutateAsync: deleteMutateAsync } = useDeleteIdentityGroupFromWorkspace();
  const { currentWorkspace } = useWorkspace();
  const navigate = useNavigate();

  const onRemoveIdentityGroupSubmit = async () => {
    try {
      await deleteMutateAsync({
        identityGroupId: identityGroupMembership.group.id,
        projectId: currentWorkspace.id
      });

      createNotification({
        text: "Successfully removed identity group from project",
        type: "success"
      });

      navigate({
        to: `${getProjectBaseURL(currentWorkspace.type)}/access-management`,
        params: {
          projectId: currentWorkspace.id
        }
      });
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to remove identity group from project",
        type: "error"
      });
    }

    handlePopUpClose("deleteIdentityGroup");
  };

  return (
    <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-4">
        <h3 className="text-lg font-semibold text-mineshaft-100">Identity Group Details</h3>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton ariaLabel="Options" colorSchema="secondary" className="w-6" variant="plain">
              <FontAwesomeIcon icon={faEllipsisV} />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent sideOffset={2} align="end">
            <ProjectPermissionCan
              I={ProjectPermissionActions.Delete}
              a={ProjectPermissionSub.IdentityGroups}
            >
              {(isAllowed) => (
                <DropdownMenuItem
                  icon={<FontAwesomeIcon icon={faTrash} />}
                  isDisabled={!isAllowed}
                  onClick={() => {
                    handlePopUpOpen("deleteIdentityGroup", {
                      identityGroupId: identityGroupMembership.group.id,
                      name: identityGroupMembership.group.name
                    });
                  }}
                >
                  Remove Identity Group From Project
                </DropdownMenuItem>
              )}
            </ProjectPermissionCan>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="pt-4">
        <div className="mb-4">
          <p className="text-sm font-semibold text-mineshaft-300">Identity Group ID</p>
          <div className="group flex items-center gap-2">
            <p className="text-sm text-mineshaft-300">{identityGroupMembership.group.id}</p>
            <CopyButton
              value={identityGroupMembership.group.id}
              name="Identity Group ID"
              size="xs"
              variant="plain"
            />
          </div>
        </div>
        <div className="mb-4">
          <p className="text-sm font-semibold text-mineshaft-300">Name</p>
          <p className="text-sm text-mineshaft-300">{identityGroupMembership.group.name}</p>
        </div>
        <div className="mb-4">
          <p className="text-sm font-semibold text-mineshaft-300">Slug</p>
          <div className="group flex items-center gap-2">
            <p className="text-sm text-mineshaft-300">{identityGroupMembership.group.slug}</p>
            <CopyButton
              value={identityGroupMembership.group.slug}
              name="Slug"
              size="xs"
              variant="plain"
            />
          </div>
        </div>
        <div className="mb-4">
          <p className="text-sm font-semibold text-mineshaft-300">Project Role</p>
          <ProjectPermissionCan
            I={ProjectPermissionActions.Edit}
            a={ProjectPermissionSub.IdentityGroups}
          >
            {(isAllowed) => (
              <IdentityGroupRoles
                className="mt-1"
                popperContentProps={{ side: "right" }}
                roles={identityGroupMembership.roles}
                identityGroupId={identityGroupMembership.group.id}
                disableEdit={!isAllowed}
              />
            )}
          </ProjectPermissionCan>
        </div>
        <div className="mb-4">
          <p className="text-sm font-semibold text-mineshaft-300">Assigned to Project</p>
          <p className="text-sm text-mineshaft-300">
            {format(identityGroupMembership.createdAt, "M/d/yyyy")}
          </p>
        </div>
      </div>
      <DeleteActionModal
        isOpen={popUp.deleteIdentityGroup.isOpen}
        title={`Are you sure you want to remove ${
          (popUp?.deleteIdentityGroup?.data as { name: string })?.name || ""
        } from this project?`}
        subTitle="This action will remove the identity group and all its members from this project. This action is irreversible."
        onChange={(isOpen) => handlePopUpToggle("deleteIdentityGroup", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={onRemoveIdentityGroupSubmit}
      />
    </div>
  );
};
