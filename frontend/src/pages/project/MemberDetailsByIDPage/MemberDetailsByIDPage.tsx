import { useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { faChevronLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { EllipsisIcon, InfoIcon, ShieldIcon } from "lucide-react";

import { AssumePrivilegesModal } from "@app/components/assume-privileges";
import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { DeleteActionModal, EmptyState, PageHeader, Spinner } from "@app/components/v2";
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  ProjectPermissionActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSub,
  useOrganization,
  useProject,
  useUser
} from "@app/context";
import { getProjectBaseURL } from "@app/helpers/project";
import { usePopUp } from "@app/hooks";
import { useDeleteUserFromWorkspace, useGetWorkspaceUserDetails } from "@app/hooks/api";
import { ActorType } from "@app/hooks/api/auditLogs/enums";
import { ProjectType } from "@app/hooks/api/projects/types";
import { ProjectAccessControlTabs } from "@app/types/project";

import { MemberPermissionAuditSheet } from "./components/MemberPermissionAuditSheet";
import { MemberProjectAdditionalPrivilegeSection } from "./components/MemberProjectAdditionalPrivilegeSection";
import { MemberRoleDetailsSection } from "./components/MemberRoleDetailsSection";
import { ProjectMemberDetailsSection } from "./components/ProjectMemberDetailsSection";

export const Page = () => {
  const navigate = useNavigate();
  const membershipId = useParams({
    strict: false,
    select: (el) => el.membershipId as string
  });
  const { currentOrg } = useOrganization();
  const { currentProject, projectId } = useProject();
  const {
    user: { id: currentUserId }
  } = useUser();

  const { data: membershipDetails, isPending: isMembershipDetailsLoading } =
    useGetWorkspaceUserDetails(projectId, membershipId, currentProject?.type);

  const { mutateAsync: removeUserFromWorkspace } = useDeleteUserFromWorkspace();

  const { handlePopUpToggle, popUp, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "removeMember",
    "upgradePlan",
    "assumePrivileges"
  ] as const);

  const [isPermissionAuditOpen, setIsPermissionAuditOpen] = useState(false);

  const handleRemoveUser = async () => {
    if (!currentOrg?.id || !currentProject?.id || !membershipDetails?.user?.username) return;

    await removeUserFromWorkspace({
      projectId,
      projectType: currentProject?.type,
      usernames: [membershipDetails?.user?.username],
      orgId: currentOrg.id
    });
    createNotification({
      text: "Successfully removed user from project",
      type: "success"
    });
    navigate({
      to: `${getProjectBaseURL(currentProject.type)}/access-management` as const,
      params: {
        projectId: currentProject.id,
        orgId: currentOrg.id
      }
    });
    handlePopUpClose("removeMember");
  };

  if (isMembershipDetailsLoading) {
    return (
      <div className="flex w-full items-center justify-center p-24">
        <Spinner />
      </div>
    );
  }

  const isOwnProjectMembershipDetails = currentUserId === membershipDetails?.user?.id;
  const isCertManager = currentProject?.type === ProjectType.CertificateManager;

  return (
    <div className="mx-auto flex max-w-8xl flex-col">
      {membershipDetails ? (
        <>
          <Link
            to={`${getProjectBaseURL(currentProject.type)}/access-management`}
            params={{
              projectId: currentProject.id,
              orgId: currentOrg.id
            }}
            search={{
              selectedTab: ProjectAccessControlTabs.Member
            }}
            className="mb-4 flex w-fit items-center gap-x-1 text-sm text-mineshaft-400 transition duration-100 hover:text-mineshaft-400/80"
          >
            <FontAwesomeIcon icon={faChevronLeft} />
            {isCertManager ? "Users" : "Project Users"}
          </Link>
          <PageHeader
            scope={currentProject.type}
            title={
              membershipDetails.user.firstName || membershipDetails.user.lastName
                ? `${membershipDetails.user.firstName} ${membershipDetails.user.lastName}`
                : membershipDetails.user.email ||
                  membershipDetails.user.username ||
                  membershipDetails.inviteEmail ||
                  "Unnamed User"
            }
            description={
              isCertManager
                ? "Configure and manage certificate manager access control"
                : "Configure and manage project access control"
            }
          >
            <div className="flex items-center gap-2">
              {!isCertManager && (
                <Button variant="outline" onClick={() => setIsPermissionAuditOpen(true)}>
                  <ShieldIcon />
                  Permission Audit
                </Button>
              )}
              {isOwnProjectMembershipDetails ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="info" className="ml-2">
                      <InfoIcon /> {isCertManager ? "Your membership" : "Your project membership"}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    {isCertManager
                      ? "You cannot modify your own membership. Ask a Certificate Manager admin to make changes to your membership."
                      : "You cannot modify your own membership. Ask a project admin to make changes to your membership."}
                  </TooltipContent>
                </Tooltip>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline">
                      Options
                      <EllipsisIcon />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => {
                        navigator.clipboard.writeText(membershipDetails.user.id);
                        createNotification({
                          text: "User ID copied to clipboard",
                          type: "info"
                        });
                      }}
                    >
                      Copy User ID
                    </DropdownMenuItem>
                    {!isCertManager && (
                      <ProjectPermissionCan
                        I={ProjectPermissionMemberActions.AssumePrivileges}
                        a={ProjectPermissionSub.Member}
                      >
                        {(isAllowed) => (
                          <Tooltip>
                            <TooltipTrigger className="block w-full">
                              <DropdownMenuItem
                                isDisabled={!isAllowed}
                                onClick={() =>
                                  handlePopUpOpen("assumePrivileges", {
                                    userId: membershipDetails.user.id
                                  })
                                }
                              >
                                Assume Privileges
                                {isAllowed && <InfoIcon className="text-muted" />}
                              </DropdownMenuItem>
                            </TooltipTrigger>
                            {isAllowed && (
                              <TooltipContent className="max-w-80" side="left">
                                Assume the privileges of this user, allowing you to replicate their
                                access behavior.
                              </TooltipContent>
                            )}
                          </Tooltip>
                        )}
                      </ProjectPermissionCan>
                    )}
                    <ProjectPermissionCan
                      I={ProjectPermissionMemberActions.Delete}
                      a={ProjectPermissionSub.Member}
                    >
                      {(isAllowed) => (
                        <DropdownMenuItem
                          variant="danger"
                          isDisabled={!isAllowed}
                          onClick={() => handlePopUpOpen("removeMember")}
                        >
                          {isCertManager
                            ? "Remove User From Certificate Manager"
                            : "Remove User From Project"}
                        </DropdownMenuItem>
                      )}
                    </ProjectPermissionCan>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </PageHeader>
          <div className="flex flex-col gap-5 lg:flex-row">
            <ProjectMemberDetailsSection membership={membershipDetails} />
            <div className="flex flex-1 flex-col gap-y-5">
              <MemberRoleDetailsSection
                membershipDetails={membershipDetails}
                isMembershipDetailsLoading={isMembershipDetailsLoading}
                onOpenUpgradeModal={() =>
                  handlePopUpOpen("upgradePlan", {
                    text: "Assigning custom roles to members can be unlocked if you upgrade to Infisical Enterprise plan.",
                    isEnterpriseFeature: true
                  })
                }
              />
              {!isCertManager && (
                <MemberProjectAdditionalPrivilegeSection membershipDetails={membershipDetails} />
              )}
            </div>
          </div>
          <DeleteActionModal
            isOpen={popUp.removeMember.isOpen}
            deleteKey="remove"
            title="Do you want to remove this user from the project?"
            onChange={(isOpen) => handlePopUpToggle("removeMember", isOpen)}
            onDeleteApproved={handleRemoveUser}
          />
          <AssumePrivilegesModal
            isOpen={popUp.assumePrivileges.isOpen}
            onOpenChange={(isOpen) => handlePopUpToggle("assumePrivileges", isOpen)}
            actorType={ActorType.USER}
            actorId={(popUp.assumePrivileges.data as { userId: string })?.userId}
          />
          <UpgradePlanModal
            isOpen={popUp.upgradePlan.isOpen}
            onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
            text={popUp.upgradePlan?.data?.text}
            isEnterpriseFeature={popUp.upgradePlan?.data?.isEnterpriseFeature}
          />
          {isPermissionAuditOpen && (
            <MemberPermissionAuditSheet
              open={isPermissionAuditOpen}
              onOpenChange={setIsPermissionAuditOpen}
              membershipId={membershipId}
              targetName={
                membershipDetails.user.firstName || membershipDetails.user.lastName
                  ? `${membershipDetails.user.firstName ?? ""} ${membershipDetails.user.lastName ?? ""}`.trim()
                  : membershipDetails.user.email ||
                    membershipDetails.user.username ||
                    membershipDetails.inviteEmail ||
                    "Unnamed User"
              }
            />
          )}
        </>
      ) : (
        <EmptyState title="Error: Unable to find the user." className="py-12" />
      )}
    </div>
  );
};

export const MemberDetailsByIDPage = () => {
  const { t } = useTranslation();

  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: t("settings.members.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <ProjectPermissionCan
        passThrough
        renderGuardBanner
        I={ProjectPermissionActions.Read}
        a={ProjectPermissionSub.Member}
      >
        <Page />
      </ProjectPermissionCan>
    </>
  );
};
