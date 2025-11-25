import { faChevronLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { formatRelative } from "date-fns";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  ConfirmActionModal,
  DeleteActionModal,
  EmptyState,
  PageHeader,
  Spinner
} from "@app/components/v2";
import {
  ProjectPermissionActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSub,
  useOrganization,
  useProject
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

export const Page = () => {
  const navigate = useNavigate();
  const membershipId = useParams({
    strict: false,
    select: (el) => el.membershipId as string
  });
  const { currentOrg, isSubOrganization } = useOrganization();
  const { currentProject, projectId } = useProject();

  const { data: membershipDetails, isPending: isMembershipDetailsLoading } =
    useGetWorkspaceUserDetails(projectId, membershipId);

  const { mutateAsync: removeUserFromWorkspace, isPending: isRemovingUserFromWorkspace } =
    useDeleteUserFromWorkspace();
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

          const url = `${getProjectHomePage(currentProject.type, currentProject.environments)}${isSubOrganization ? `?subOrganization=${currentOrg.slug}` : ""}`;
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

  return (
    <div className="mx-auto flex max-w-8xl flex-col justify-between bg-bunker-800 text-white">
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
            className="mb-4 flex items-center gap-x-2 text-sm text-mineshaft-400"
          >
            <FontAwesomeIcon icon={faChevronLeft} />
            Project Users
          </Link>
          <PageHeader
            scope={currentProject.type}
            title={
              membershipDetails.user.firstName || membershipDetails.user.lastName
                ? `${membershipDetails.user.firstName} ${membershipDetails.user.lastName}`
                : "-"
            }
            description={`User joined on ${membershipDetails?.createdAt && formatRelative(new Date(membershipDetails?.createdAt || ""), new Date())}`}
          >
            <ProjectPermissionCan
              I={ProjectPermissionMemberActions.AssumePrivileges}
              a={ProjectPermissionSub.Member}
              renderTooltip
              allowedLabel="Assume privileges of the user"
              passThrough={false}
            >
              {(isAllowed) => (
                <Button
                  variant="outline_bg"
                  size="xs"
                  isDisabled={!isAllowed}
                  isLoading={assumePrivileges.isPending}
                  onClick={() =>
                    handlePopUpOpen("assumePrivileges", { userId: membershipDetails?.user?.id })
                  }
                >
                  Assume Privileges
                </Button>
              )}
            </ProjectPermissionCan>

            <ProjectPermissionCan
              I={ProjectPermissionMemberActions.Delete}
              a={ProjectPermissionSub.Member}
              renderTooltip
              allowedLabel="Remove from project"
            >
              {(isAllowed) => (
                <Button
                  colorSchema="danger"
                  variant="outline_bg"
                  size="xs"
                  isDisabled={!isAllowed}
                  isLoading={isRemovingUserFromWorkspace}
                  onClick={() => handlePopUpOpen("removeMember")}
                >
                  Remove User
                </Button>
              )}
            </ProjectPermissionCan>
          </PageHeader>
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
