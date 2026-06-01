import { UserPlusIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { ConfirmActionModal, DeleteActionModal } from "@app/components/v2";
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DocumentationLinkBadge
} from "@app/components/v3";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useOrganization,
  useProject
} from "@app/context";
import { getProjectHomePage } from "@app/helpers/project";
import { usePopUp } from "@app/hooks";
import { useAssumeProjectPrivileges, useDeleteUserFromWorkspace } from "@app/hooks/api";
import { ActorType } from "@app/hooks/api/auditLogs/enums";
import { ProjectType } from "@app/hooks/api/projects/types";

import { AddMemberModal } from "./AddMemberModal";
import { MembersTable } from "./MembersTable";

export const MembersSection = () => {
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const isCertManager = currentProject?.type === ProjectType.CertificateManager;
  const productLabel = isCertManager ? "Certificate Manager" : "Project";

  const { mutateAsync: removeUserFromWorkspace } = useDeleteUserFromWorkspace();
  const assumePrivileges = useAssumeProjectPrivileges();

  const { handlePopUpToggle, popUp, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "addMember",
    "removeMember",
    "assumePrivileges"
  ] as const);

  const handleAssumePrivileges = async () => {
    const userId = (popUp?.assumePrivileges?.data as { userId: string })?.userId;
    if (!currentOrg?.id || !currentProject?.id) return;

    assumePrivileges.mutate(
      {
        actorId: userId,
        actorType: ActorType.USER,
        projectId: currentProject.id
      },
      {
        onSuccess: () => {
          createNotification({
            type: "success",
            text: "User privilege assumption has started"
          });

          const url = getProjectHomePage(currentProject.type, currentProject.environments);
          window.location.assign(
            url.replace("$orgId", currentOrg.id).replace("$projectId", currentProject.id)
          );
        }
      }
    );
  };

  const handleRemoveUser = async () => {
    const username = (popUp?.removeMember?.data as { username: string })?.username;
    if (!currentOrg?.id) return;
    if (!currentProject?.id) return;

    await removeUserFromWorkspace({
      projectId: currentProject.id,
      projectType: currentProject.type,
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
      <Card>
        <CardHeader>
          <CardTitle>
            {isCertManager ? "Users" : `${productLabel} Users`}
            <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/identities/user-identities" />
          </CardTitle>
          <CardDescription>
            {`Invite and manage ${productLabel.toLowerCase()} users`}
          </CardDescription>
          <CardAction>
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
                  {isCertManager ? "Add Users" : `Add Users to ${productLabel}`}
                </Button>
              )}
            </ProjectPermissionCan>
          </CardAction>
        </CardHeader>
        <CardContent>
          <MembersTable handlePopUpOpen={handlePopUpOpen} />
        </CardContent>
      </Card>
      <AddMemberModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <DeleteActionModal
        isOpen={popUp.removeMember.isOpen}
        deleteKey="remove"
        title={`Do you want to remove this user from the ${productLabel.toLowerCase()}?`}
        onChange={(isOpen) => handlePopUpToggle("removeMember", isOpen)}
        onDeleteApproved={handleRemoveUser}
      />
      <ConfirmActionModal
        isOpen={popUp.assumePrivileges.isOpen}
        confirmKey="assume"
        title="Do you want to assume privileges of this user?"
        subTitle="This will set your privileges to those of the user for the next hour."
        onChange={(isOpen) => handlePopUpToggle("assumePrivileges", isOpen)}
        onConfirmed={handleAssumePrivileges}
        buttonText="Confirm"
      />
    </>
  );
};
