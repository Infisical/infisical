import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "@tanstack/react-router";
import { twMerge } from "tailwind-merge";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Button,
  DeleteActionModal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  PageHeader,
  Tooltip
} from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  useOrganization,
  useUser
} from "@app/context";
import { withPermission } from "@app/hoc";
import {
  useDeleteOrgMembership,
  useGetOrgMembership,
  useUpdateOrgMembership
} from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";
import { OrgAccessControlTabSections } from "@app/types/org";

import { UserAuditLogsSection } from "./components/UserProjectsSection/UserAuditLogsSection";
import { UserGroupsSection } from "./components/UserProjectsSection/UserGroupsSection";
import { UserDetailsSection, UserOrgMembershipModal, UserProjectsSection } from "./components";

const Page = withPermission(
  () => {
    const navigate = useNavigate();
    const search = useParams({
      from: ROUTE_PATHS.Organization.UserDetailsByIDPage.id
    });
    const membershipId = search.membershipId as string;
    const { user } = useUser();
    const { currentOrg } = useOrganization();

    const userId = user?.id || "";
    const orgId = currentOrg?.id || "";

    const { data: membership } = useGetOrgMembership(orgId, membershipId);

    const { mutateAsync: deleteOrgMembership } = useDeleteOrgMembership();
    const { mutateAsync: updateOrgMembership } = useUpdateOrgMembership();

    const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
      "removeMember",
      "orgMembership",
      "deactivateMember",
      "upgradePlan"
    ] as const);

    const onDeactivateMemberSubmit = async (orgMembershipId: string) => {
      try {
        await updateOrgMembership({
          organizationId: orgId,
          membershipId: orgMembershipId,
          isActive: false
        });

        createNotification({
          text: "Successfully deactivated user in organization",
          type: "success"
        });
      } catch (err) {
        console.error(err);
        createNotification({
          text: "Failed to deactivate user in organization",
          type: "error"
        });
      }

      handlePopUpClose("deactivateMember");
    };

    const onRemoveMemberSubmit = async (orgMembershipId: string) => {
      try {
        await deleteOrgMembership({
          orgId,
          membershipId: orgMembershipId
        });

        createNotification({
          text: "Successfully removed user from org",
          type: "success"
        });

        handlePopUpClose("removeMember");
        navigate({
          to: "/organization/access-management" as const,
          search: {
            selectedTab: OrgAccessControlTabSections.Member
          }
        });
      } catch (err) {
        console.error(err);
        createNotification({
          text: "Failed to remove user from the organization",
          type: "error"
        });
      }

      handlePopUpClose("removeMember");
    };

    return (
      <div className="container mx-auto flex flex-col justify-between bg-bunker-800 text-white">
        {membership && (
          <div className="mx-auto mb-6 w-full max-w-7xl">
            <PageHeader
              title={
                membership.user.firstName || membership.user.lastName
                  ? `${membership.user.firstName} ${membership.user.lastName ?? ""}`.trim()
                  : "-"
              }
            >
              <div>
                {userId !== membership.user.id && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild className="rounded-lg">
                      <div className="hover:text-primary-400 data-[state=open]:text-primary-400">
                        <Tooltip content="More options">
                          <Button variant="outline_bg" size="sm">
                            More
                          </Button>
                        </Tooltip>
                      </div>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="p-1">
                      <OrgPermissionCan
                        I={OrgPermissionActions.Edit}
                        a={OrgPermissionSubjects.Member}
                      >
                        {(isAllowed) => (
                          <DropdownMenuItem
                            className={twMerge(
                              !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                            )}
                            onClick={() =>
                              handlePopUpOpen("orgMembership", {
                                membershipId: membership.id,
                                role: membership.role,
                                roleId: membership.roleId
                              })
                            }
                            disabled={!isAllowed}
                          >
                            Edit User
                          </DropdownMenuItem>
                        )}
                      </OrgPermissionCan>
                      <OrgPermissionCan
                        I={OrgPermissionActions.Delete}
                        a={OrgPermissionSubjects.Member}
                      >
                        {(isAllowed) => (
                          <DropdownMenuItem
                            className={
                              membership.isActive
                                ? twMerge(
                                    isAllowed
                                      ? "hover:!bg-red-500 hover:!text-white"
                                      : "pointer-events-none cursor-not-allowed opacity-50"
                                  )
                                : ""
                            }
                            onClick={async () => {
                              if (currentOrg?.scimEnabled) {
                                createNotification({
                                  text: "You cannot manage users from Infisical when SCIM is enabled for your organization",
                                  type: "error"
                                });
                                return;
                              }

                              if (!membership.isActive) {
                                // activate user
                                await updateOrgMembership({
                                  organizationId: orgId,
                                  membershipId,
                                  isActive: true
                                });

                                return;
                              }

                              // deactivate user
                              handlePopUpOpen("deactivateMember", {
                                orgMembershipId: membershipId,
                                username: membership.user.username
                              });
                            }}
                            disabled={!isAllowed}
                          >
                            {`${membership.isActive ? "Deactivate" : "Activate"} User`}
                          </DropdownMenuItem>
                        )}
                      </OrgPermissionCan>
                      <OrgPermissionCan
                        I={OrgPermissionActions.Delete}
                        a={OrgPermissionSubjects.Member}
                      >
                        {(isAllowed) => (
                          <DropdownMenuItem
                            className={twMerge(
                              isAllowed
                                ? "hover:!bg-red-500 hover:!text-white"
                                : "pointer-events-none cursor-not-allowed opacity-50"
                            )}
                            onClick={() => {
                              if (currentOrg?.scimEnabled) {
                                createNotification({
                                  text: "You cannot manage users from Infisical when SCIM is enabled for your organization",
                                  type: "error"
                                });
                                return;
                              }

                              handlePopUpOpen("removeMember", {
                                orgMembershipId: membershipId,
                                username: membership.user.username
                              });
                            }}
                            disabled={!isAllowed}
                          >
                            Remove User
                          </DropdownMenuItem>
                        )}
                      </OrgPermissionCan>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </PageHeader>
            <div className="flex">
              <div className="mr-4 w-96">
                <UserDetailsSection membershipId={membershipId} handlePopUpOpen={handlePopUpOpen} />
              </div>
              <div className="w-full space-y-2">
                <div className="w-full space-y-4">
                  <UserProjectsSection membershipId={membershipId} />
                  <UserGroupsSection orgMembership={membership} />
                  <UserAuditLogsSection orgMembership={membership} />
                </div>
              </div>
            </div>
          </div>
        )}
        <DeleteActionModal
          isOpen={popUp.removeMember.isOpen}
          title={`Are you sure you want to remove member with username ${
            (popUp?.removeMember?.data as { username: string })?.username || ""
          }?`}
          onChange={(isOpen) => handlePopUpToggle("removeMember", isOpen)}
          deleteKey="confirm"
          onDeleteApproved={() =>
            onRemoveMemberSubmit(
              (popUp?.removeMember?.data as { orgMembershipId: string })?.orgMembershipId
            )
          }
        />
        <DeleteActionModal
          isOpen={popUp.deactivateMember.isOpen}
          title={`Are you sure you want to deactivate member with username ${
            (popUp?.deactivateMember?.data as { username: string })?.username || ""
          }?`}
          onChange={(isOpen) => handlePopUpToggle("deactivateMember", isOpen)}
          deleteKey="confirm"
          onDeleteApproved={() =>
            onDeactivateMemberSubmit(
              (popUp?.deactivateMember?.data as { orgMembershipId: string })?.orgMembershipId
            )
          }
          buttonText="Deactivate"
        />

        <UpgradePlanModal
          isOpen={popUp.upgradePlan.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
          text={(popUp.upgradePlan?.data as { description: string })?.description}
        />
        <UserOrgMembershipModal
          popUp={popUp}
          handlePopUpOpen={handlePopUpOpen}
          handlePopUpToggle={handlePopUpToggle}
        />
      </div>
    );
  },
  {
    action: OrgPermissionActions.Read,
    subject: OrgPermissionSubjects.Member
  }
);

export const UserDetailsByIDPage = () => {
  const { t } = useTranslation();
  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: t("settings.org.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <Page />
    </>
  );
};
