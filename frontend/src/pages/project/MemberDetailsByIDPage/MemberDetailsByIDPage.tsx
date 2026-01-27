import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { faChevronLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { EllipsisIcon, InfoIcon } from "lucide-react";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  ConfirmActionModal,
  DeleteActionModal,
  EmptyState,
  PageHeader,
  Spinner,
  Tooltip
} from "@app/components/v2";
import {
  Badge,
  Button,
  UnstableDropdownMenu,
  UnstableDropdownMenuContent,
  UnstableDropdownMenuItem,
  UnstableDropdownMenuTrigger
} from "@app/components/v3";
import {
  ProjectPermissionActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSub,
  useOrganization,
  useProject,
  useUser
} from "@app/context";
import { getProjectBaseURL, getProjectHomePage } from "@app/helpers/project";
import { usePopUp } from "@app/hooks";
import {
  useAssumeProjectPrivileges,
  useDeleteUserFromWorkspace,
  useGetWorkspaceUserDetails
} from "@app/hooks/api";
import { ActorType } from "@app/hooks/api/auditLogs/enums";
import { ProjectAccessControlTabs } from "@app/types/project";

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
    useGetWorkspaceUserDetails(projectId, membershipId);

  const { mutateAsync: removeUserFromWorkspace } = useDeleteUserFromWorkspace();
  const assumePrivileges = useAssumeProjectPrivileges();

  const { handlePopUpToggle, popUp, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "removeMember",
    "upgradePlan",
    "assumePrivileges"
  ] as const);

  const handleAssumePrivileges = async () => {
    const { userId } = popUp?.assumePrivileges?.data as { userId: string };
    assumePrivileges.mutate(
      {
        actorId: userId,
        actorType: ActorType.USER,
        projectId
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
    if (!currentOrg?.id || !currentProject?.id || !membershipDetails?.user?.username) return;

    await removeUserFromWorkspace({
      projectId,
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
            Project Users
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
            description="Configure and manage project access control"
          >
            {isOwnProjectMembershipDetails ? (
              <Tooltip
                side="right"
                content="You cannot modify your own membership. Ask a project admin to make changes to your membership."
              >
                <Badge variant="info" className="ml-2">
                  <InfoIcon /> Your project membership
                </Badge>
              </Tooltip>
            ) : (
              <UnstableDropdownMenu>
                <UnstableDropdownMenuTrigger asChild>
                  <Button variant="outline">
                    Options
                    <EllipsisIcon />
                  </Button>
                </UnstableDropdownMenuTrigger>
                <UnstableDropdownMenuContent align="end">
                  <UnstableDropdownMenuItem
                    onClick={() => {
                      navigator.clipboard.writeText(membershipDetails.user.id);
                      createNotification({
                        text: "User ID copied to clipboard",
                        type: "info"
                      });
                    }}
                  >
                    Copy User ID
                  </UnstableDropdownMenuItem>
                  <ProjectPermissionCan
                    I={ProjectPermissionMemberActions.AssumePrivileges}
                    a={ProjectPermissionSub.Member}
                  >
                    {(isAllowed) => (
                      <UnstableDropdownMenuItem
                        isDisabled={!isAllowed}
                        onClick={() =>
                          handlePopUpOpen("assumePrivileges", {
                            userId: membershipDetails.user.id
                          })
                        }
                      >
                        Assume Privileges
                        <Tooltip
                          side="bottom"
                          content="Assume the privileges of this user, allowing you to replicate their access behavior."
                        >
                          <div>
                            <InfoIcon className="text-muted" />
                          </div>
                        </Tooltip>
                      </UnstableDropdownMenuItem>
                    )}
                  </ProjectPermissionCan>
                  <ProjectPermissionCan
                    I={ProjectPermissionMemberActions.Delete}
                    a={ProjectPermissionSub.Member}
                  >
                    {(isAllowed) => (
                      <UnstableDropdownMenuItem
                        variant="danger"
                        isDisabled={!isAllowed}
                        onClick={() => handlePopUpOpen("removeMember")}
                      >
                        Remove User From Project
                      </UnstableDropdownMenuItem>
                    )}
                  </ProjectPermissionCan>
                </UnstableDropdownMenuContent>
              </UnstableDropdownMenu>
            )}
          </PageHeader>
          <div className="flex flex-col gap-5 lg:flex-row">
            <ProjectMemberDetailsSection membership={membershipDetails} />
            <div className="flex flex-1 flex-col gap-y-5">
              <MemberRoleDetailsSection
                membershipDetails={membershipDetails}
                isMembershipDetailsLoading={isMembershipDetailsLoading}
                onOpenUpgradeModal={() =>
                  handlePopUpOpen("upgradePlan", {
                    text: "Assigning custom roles to members can be unlocked if you upgrade to Infisical Pro plan."
                  })
                }
              />
              <MemberProjectAdditionalPrivilegeSection membershipDetails={membershipDetails} />
            </div>
          </div>
          <DeleteActionModal
            isOpen={popUp.removeMember.isOpen}
            deleteKey="remove"
            title="Do you want to remove this user from the project?"
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
          <UpgradePlanModal
            isOpen={popUp.upgradePlan.isOpen}
            onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
            text={popUp.upgradePlan?.data?.text}
          />
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
