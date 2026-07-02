import { UserPlusIcon } from "lucide-react";

import { AssumePrivilegesModal } from "@app/components/assume-privileges";
import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { DeleteActionModal } from "@app/components/v2";
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
import { usePopUp } from "@app/hooks";
import { useDeleteUserFromWorkspace } from "@app/hooks/api";
import { ActorType } from "@app/hooks/api/auditLogs/enums";
import { ProjectType } from "@app/hooks/api/projects/types";

import { AddMemberModal } from "./AddMemberModal";
import { InviteMembersModal } from "./InviteMembersModal";
import { MembersTable } from "./MembersTable";

export const MembersSection = () => {
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const isCertManager = currentProject?.type === ProjectType.CertificateManager;
  const productLabel = isCertManager ? "Certificate Manager" : "Project";

  const { mutateAsync: removeUserFromWorkspace } = useDeleteUserFromWorkspace();

  const { handlePopUpToggle, popUp, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "addMember",
    "inviteMembers",
    "removeMember",
    "assumePrivileges"
  ] as const);

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
            <div className="flex items-center gap-2">
              {/* TEMP: preview trigger for the Invite Members modal. Replace with the real action later. */}
              <ProjectPermissionCan
                I={ProjectPermissionActions.Create}
                a={ProjectPermissionSub.Member}
              >
                {(isAllowed) => (
                  <Button
                    variant="outline"
                    onClick={() => handlePopUpOpen("inviteMembers")}
                    isDisabled={!isAllowed}
                  >
                    Invite team (preview)
                  </Button>
                )}
              </ProjectPermissionCan>
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
            </div>
          </CardAction>
        </CardHeader>
        <CardContent>
          <MembersTable handlePopUpOpen={handlePopUpOpen} />
        </CardContent>
      </Card>
      <AddMemberModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <InviteMembersModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <DeleteActionModal
        isOpen={popUp.removeMember.isOpen}
        deleteKey="remove"
        title={`Do you want to remove this user from the ${productLabel.toLowerCase()}?`}
        onChange={(isOpen) => handlePopUpToggle("removeMember", isOpen)}
        onDeleteApproved={handleRemoveUser}
      />
      <AssumePrivilegesModal
        isOpen={popUp.assumePrivileges.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("assumePrivileges", isOpen)}
        actorType={ActorType.USER}
        actorId={(popUp.assumePrivileges.data as { userId: string })?.userId}
      />
    </>
  );
};
