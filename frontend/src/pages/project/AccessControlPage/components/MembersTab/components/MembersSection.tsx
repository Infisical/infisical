import { UserPlusIcon } from "lucide-react";

import { AssumePrivilegesDialog } from "@app/components/assume-privileges";
import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DeleteConfirmDialog,
  DocumentationLinkBadge,
  Tooltip,
  TooltipContent,
  TooltipTrigger
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
import { MembersTable } from "./MembersTable";

export const MembersSection = () => {
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const isCertManager = currentProject?.type === ProjectType.CertificateManager;
  const productLabel = isCertManager ? "Certificate Manager" : "Project";

  const removeUserMutation = useDeleteUserFromWorkspace();

  const { handlePopUpToggle, popUp, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "addMember",
    "removeMember",
    "assumePrivileges"
  ] as const);

  const handleRemoveUser = async () => {
    const username = (popUp?.removeMember?.data as { username: string })?.username;
    if (!currentOrg?.id) return;
    if (!currentProject?.id) return;

    await removeUserMutation.mutateAsync({
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

  const removeMemberUsername = (popUp?.removeMember?.data as { username?: string })?.username;

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
              {(isAllowed) => {
                const button = (
                  <Button
                    variant="project"
                    onClick={() => handlePopUpOpen("addMember")}
                    isDisabled={!isAllowed}
                  >
                    <UserPlusIcon />
                    {isCertManager ? "Add Users" : `Add Users to ${productLabel}`}
                  </Button>
                );

                return isAllowed ? (
                  button
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
                      <span tabIndex={0}>{button}</span>
                    </TooltipTrigger>
                    <TooltipContent>
                      You don&apos;t have permission to add users to this{" "}
                      {productLabel.toLowerCase()}
                    </TooltipContent>
                  </Tooltip>
                );
              }}
            </ProjectPermissionCan>
          </CardAction>
        </CardHeader>
        <CardContent>
          <MembersTable handlePopUpOpen={handlePopUpOpen} />
        </CardContent>
      </Card>
      <AddMemberModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <DeleteConfirmDialog
        isOpen={popUp.removeMember.isOpen}
        onOpenChange={(isOpen) => {
          handlePopUpToggle("removeMember", isOpen);
        }}
        title={`Remove ${removeMemberUsername || "this user"} from the ${productLabel.toLowerCase()}?`}
        description={
          <Alert variant="danger" appearance="borderless">
            <AlertDescription>
              This user will lose access granted by this membership. This cannot be undone.
            </AlertDescription>
          </Alert>
        }
        confirmKey="remove"
        confirmLabel="Remove User"
        isPending={removeUserMutation.isPending}
        onConfirm={handleRemoveUser}
      />
      <AssumePrivilegesDialog
        isOpen={popUp.assumePrivileges.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("assumePrivileges", isOpen)}
        actorType={ActorType.USER}
        actorId={(popUp.assumePrivileges.data as { userId: string })?.userId}
      />
    </>
  );
};
