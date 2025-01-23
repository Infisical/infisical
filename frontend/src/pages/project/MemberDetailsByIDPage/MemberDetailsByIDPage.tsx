import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "@tanstack/react-router";
import { formatRelative } from "date-fns";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { Button, DeleteActionModal, EmptyState, PageHeader, Spinner } from "@app/components/v2";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useOrganization,
  useWorkspace
} from "@app/context";
import { usePopUp } from "@app/hooks";
import { useDeleteUserFromWorkspace, useGetWorkspaceUserDetails } from "@app/hooks/api";

import { MemberProjectAdditionalPrivilegeSection } from "./components/MemberProjectAdditionalPrivilegeSection";
import { MemberRoleDetailsSection } from "./components/MemberRoleDetailsSection";

export const Page = () => {
  const navigate = useNavigate();
  const membershipId = useParams({
    strict: false,
    select: (el) => el.membershipId as string
  });
  const { currentOrg } = useOrganization();
  const { currentWorkspace } = useWorkspace();

  const workspaceId = currentWorkspace?.id || "";

  const { data: membershipDetails, isPending: isMembershipDetailsLoading } =
    useGetWorkspaceUserDetails(workspaceId, membershipId);

  const { mutateAsync: removeUserFromWorkspace, isPending: isRemovingUserFromWorkspace } =
    useDeleteUserFromWorkspace();

  const { handlePopUpToggle, popUp, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "removeMember",
    "upgradePlan"
  ] as const);

  const handleRemoveUser = async () => {
    if (!currentOrg?.id || !currentWorkspace?.id || !membershipDetails?.user?.username) return;

    try {
      await removeUserFromWorkspace({
        workspaceId: currentWorkspace.id,
        usernames: [membershipDetails?.user?.username],
        orgId: currentOrg.id
      });
      createNotification({
        text: "Successfully removed user from project",
        type: "success"
      });
      navigate({
        to: `/${currentWorkspace.type}/$projectId/access-management` as const,
        params: {
          projectId: currentWorkspace.id
        }
      });
    } catch (error) {
      console.error(error);
      createNotification({
        text: "Failed to remove user from the project",
        type: "error"
      });
    }
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
    <div className="container mx-auto flex max-w-7xl flex-col justify-between bg-bunker-800 text-white">
      {membershipDetails ? (
        <>
          <PageHeader
            title={
              membershipDetails.user.firstName || membershipDetails.user.lastName
                ? `${membershipDetails.user.firstName} ${membershipDetails.user.lastName}`
                : "-"
            }
            description={`User joined on ${membershipDetails?.createdAt && formatRelative(new Date(membershipDetails?.createdAt || ""), new Date())}`}
          >
            <ProjectPermissionCan
              I={ProjectPermissionActions.Delete}
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
                description:
                  "You can assign custom roles to members if you upgrade your Infisical plan."
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
          <UpgradePlanModal
            isOpen={popUp.upgradePlan.isOpen}
            onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
            text={(popUp.upgradePlan?.data as { description: string })?.description}
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
