import { UserPlusIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { DeleteActionModal } from "@app/components/v2";
import {
  Button,
  DocumentationLinkBadge,
  UnstableCard,
  UnstableCardAction,
  UnstableCardContent,
  UnstableCardDescription,
  UnstableCardHeader,
  UnstableCardTitle
} from "@app/components/v3";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useOrganization,
  useProject
} from "@app/context";
import { usePopUp } from "@app/hooks";
import { useDeleteUserFromWorkspace } from "@app/hooks/api";

import { AddMemberModal } from "./AddMemberModal";
import { MembersTable } from "./MembersTable";

export const MembersSection = () => {
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();

  const { mutateAsync: removeUserFromWorkspace } = useDeleteUserFromWorkspace();

  const { handlePopUpToggle, popUp, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "addMember",
    "removeMember"
  ] as const);

  const handleRemoveUser = async () => {
    const username = (popUp?.removeMember?.data as { username: string })?.username;
    if (!currentOrg?.id) return;
    if (!currentProject?.id) return;

    await removeUserFromWorkspace({
      projectId: currentProject.id,
      usernames: [username],
      orgId: currentOrg.id
    });
    createNotification({
      text: "Successfully removed user from project",
      type: "success"
    });
    handlePopUpClose("removeMember");
  };

  return (
    <>
      <UnstableCard>
        <UnstableCardHeader>
          <UnstableCardTitle>
            Project Users
            <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/identities/user-identities" />
          </UnstableCardTitle>
          <UnstableCardDescription>Invite and manage project users</UnstableCardDescription>
          <UnstableCardAction>
            <ProjectPermissionCan
              I={ProjectPermissionActions.Create}
              a={ProjectPermissionSub.Member}
            >
              {(isAllowed) => (
                <Button
                  variant="project"
                  onClick={() => handlePopUpOpen("addMember")}
                  isDisabled={!isAllowed}
                >
                  <UserPlusIcon />
                  Add Users to Project
                </Button>
              )}
            </ProjectPermissionCan>
          </UnstableCardAction>
        </UnstableCardHeader>
        <UnstableCardContent>
          <MembersTable handlePopUpOpen={handlePopUpOpen} />
        </UnstableCardContent>
      </UnstableCard>
      <AddMemberModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <DeleteActionModal
        isOpen={popUp.removeMember.isOpen}
        deleteKey="remove"
        title="Do you want to remove this user from the project?"
        onChange={(isOpen) => handlePopUpToggle("removeMember", isOpen)}
        onDeleteApproved={handleRemoveUser}
      />
    </>
  );
};
