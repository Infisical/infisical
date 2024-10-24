import { useRouter } from "next/router";
import { faChevronLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  DeleteActionModal,
  EmptyState,
  Spinner,
  UpgradePlanModal
} from "@app/components/v2";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useOrganization,
  useWorkspace
} from "@app/context";
import { withProjectPermission } from "@app/hoc";
import { usePopUp } from "@app/hooks";
import { useDeleteUserFromWorkspace, useGetWorkspaceUserDetails } from "@app/hooks/api";

import { MemberProjectAdditionalPrivilegeSection } from "./components/MemberProjectAdditionalPrivilegeSection";
import { MemberRoleDetailsSection } from "./components/MemberRoleDetailsSection";

export const MemberDetailsPage = withProjectPermission(
  () => {
    const router = useRouter();
    const { currentOrg } = useOrganization();
    const { currentWorkspace } = useWorkspace();

    const workspaceId = currentWorkspace?.id || "";
    const membershipId = router.query.membershipId as string;

    const { data: membershipDetails, isLoading: isMembershipDetailsLoading } =
      useGetWorkspaceUserDetails(workspaceId, membershipId);

    const { mutateAsync: removeUserFromWorkspace, isLoading: isRemovingUserFromWorkspace } =
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
        router.push(`/project/${currentWorkspace?.id}/members`);
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
      <div className="container mx-auto flex max-w-7xl flex-col justify-between bg-bunker-800 p-6 text-white">
        <div className="mb-4">
          <Button
            variant="link"
            type="submit"
            leftIcon={<FontAwesomeIcon icon={faChevronLeft} />}
            onClick={() => {
              router.push(`/project/${workspaceId}/members`);
            }}
            className="mb-4"
          >
            Project Access Control
          </Button>
        </div>
        {membershipDetails ? (
          <>
            <div className="mb-4">
              <div className="w-full rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
                <div className="mb-4 flex items-center justify-between ">
                  <h3 className="text-xl font-semibold text-mineshaft-100">Project User Access</h3>
                  <div>
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
                  </div>
                </div>
                <div className="flex gap-12">
                  <div>
                    <span className="text-xs font-semibold text-gray-400">Name</span>
                    {membershipDetails && (
                      <p className="text-lg capitalize">
                        {membershipDetails.user.firstName || membershipDetails.user.lastName
                          ? `${membershipDetails.user.firstName} ${membershipDetails.user.lastName}`
                          : "-"}
                      </p>
                    )}
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-gray-400">Email</span>
                    {membershipDetails && (
                      <p className="text-lg">{membershipDetails?.user?.email}</p>
                    )}
                  </div>
                </div>
                <div className="mt-4 text-sm text-gray-400">
                  Joined on{" "}
                  {membershipDetails?.createdAt &&
                    format(new Date(membershipDetails?.createdAt || ""), "yyyy-MM-dd")}
                </div>
              </div>
            </div>
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
  },
  {
    action: ProjectPermissionActions.Read,
    subject: ProjectPermissionSub.Member
  }
);
