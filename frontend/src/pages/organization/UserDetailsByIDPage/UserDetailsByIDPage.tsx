import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { ChevronLeftIcon, EllipsisIcon } from "lucide-react";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { DeleteActionModal, PageHeader } from "@app/components/v2";
import {
  Button,
  UnstableDropdownMenu,
  UnstableDropdownMenuContent,
  UnstableDropdownMenuItem,
  UnstableDropdownMenuTrigger
} from "@app/components/v3";
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
    const { currentOrg, isSubOrganization } = useOrganization();

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
      await updateOrgMembership({
        organizationId: orgId,
        membershipId: orgMembershipId,
        isActive: false
      });

      createNotification({
        text: "Successfully deactivated user in organization",
        type: "success"
      });

      handlePopUpClose("deactivateMember");
    };

    const onRemoveMemberSubmit = async (orgMembershipId: string) => {
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
        to: "/organizations/$orgId/access-management" as const,
        params: { orgId },
        search: {
          selectedTab: OrgAccessControlTabSections.Member
        }
      });
    };

    return (
      <div className="mx-auto flex max-w-8xl flex-col">
        {membership && (
          <>
            <Link
              to="/organizations/$orgId/access-management"
              params={{ orgId }}
              search={{
                selectedTab: OrgAccessControlTabSections.Member
              }}
              className="mb-4 flex w-fit items-center gap-x-1 text-sm text-mineshaft-400 transition duration-100 hover:text-mineshaft-400/80"
            >
              <ChevronLeftIcon size={16} />
              {isSubOrganization ? "Sub-" : ""}Organization Users
            </Link>
            <PageHeader
              scope={isSubOrganization ? "namespace" : "org"}
              title={
                membership.user.firstName || membership.user.lastName
                  ? `${membership.user.firstName} ${membership.user.lastName ?? ""}`.trim()
                  : (membership.user.username ??
                    membership.user.email ??
                    membership.inviteEmail ??
                    "Unknown User")
              }
              description={`Configure and manage${isSubOrganization ? " sub-" : " "}organization user membership`}
            >
              {userId !== membership.user.id && (
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
                        navigator.clipboard.writeText(membership.user.id);
                        createNotification({
                          text: "User ID copied to clipboard",
                          type: "info"
                        });
                      }}
                    >
                      Copy User ID
                    </UnstableDropdownMenuItem>
                    <OrgPermissionCan
                      I={OrgPermissionActions.Edit}
                      a={OrgPermissionSubjects.Member}
                    >
                      {(isAllowed) => (
                        <UnstableDropdownMenuItem
                          isDisabled={!isAllowed}
                          onClick={() =>
                            handlePopUpOpen("orgMembership", {
                              membershipId: membership.id,
                              role: membership.role,
                              roleId: membership.roleId,
                              metadata: membership.metadata
                            })
                          }
                        >
                          Edit User
                        </UnstableDropdownMenuItem>
                      )}
                    </OrgPermissionCan>
                    <OrgPermissionCan
                      I={OrgPermissionActions.Delete}
                      a={OrgPermissionSubjects.Member}
                    >
                      {(isAllowed) => (
                        <UnstableDropdownMenuItem
                          isDisabled={!isAllowed}
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
                        >
                          {`${membership.isActive ? "Deactivate" : "Activate"} User`}
                        </UnstableDropdownMenuItem>
                      )}
                    </OrgPermissionCan>
                    <OrgPermissionCan
                      I={OrgPermissionActions.Delete}
                      a={OrgPermissionSubjects.Member}
                    >
                      {(isAllowed) => (
                        <UnstableDropdownMenuItem
                          variant="danger"
                          isDisabled={!isAllowed}
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
                        >
                          Remove User
                        </UnstableDropdownMenuItem>
                      )}
                    </OrgPermissionCan>
                  </UnstableDropdownMenuContent>
                </UnstableDropdownMenu>
              )}
            </PageHeader>
            <div className="flex flex-col gap-5 lg:flex-row">
              <UserDetailsSection membershipId={membershipId} handlePopUpOpen={handlePopUpOpen} />
              <div className="flex flex-1 flex-col gap-y-5">
                <UserProjectsSection membershipId={membershipId} />
                <UserGroupsSection orgMembership={membership} />
                <UserAuditLogsSection orgMembership={membership} />
              </div>
            </div>
          </>
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
          text={popUp.upgradePlan?.data?.text}
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
