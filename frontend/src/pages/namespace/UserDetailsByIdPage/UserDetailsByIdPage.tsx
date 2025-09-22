import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "@tanstack/react-router";
import { twMerge } from "tailwind-merge";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
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
import { useNamespace, useUser } from "@app/context";
import { withNamespacePermission } from "@app/hoc";
import {} from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";
import { OrgAccessControlTabSections } from "@app/types/org";

import { UserDetailsSection } from "./components";
import { MemberRoleDetailsSection } from "./components/MemberRoleDetailsSection";
import { useQuery } from "@tanstack/react-query";
import {
  namespaceUserMembershipQueryKeys,
  useDeleteNamespaceUserMembership
} from "@app/hooks/api/namespaceUserMembership";
import { NamespacePermissionCan } from "@app/components/permissions";
import {
  NamespacePermissionActions,
  NamespacePermissionSubjects
} from "@app/context/NamespacePermissionContext/types";

const Page = withNamespacePermission(
  () => {
    const navigate = useNavigate();
    const search = useParams({
      from: ROUTE_PATHS.Namespace.UserDetailsByIDPage.id
    });
    const membershipId = search.membershipId as string;
    const { user } = useUser();
    const { namespaceName } = useNamespace();

    const userId = user?.id || "";

    const { data: membership } = useQuery(
      namespaceUserMembershipQueryKeys.detail({
        membershipId,
        namespaceSlug: namespaceName
      })
    );

    const { mutateAsync: deleteNamespaceMembership } = useDeleteNamespaceUserMembership();

    const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
      "removeMember",
      "namespaceMembership",
      "deactivateMember",
      "upgradePlan"
    ] as const);

    const onRemoveMemberSubmit = async () => {
      try {
        await deleteNamespaceMembership({
          membershipId,
          namespaceSlug: namespaceName
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
                      <NamespacePermissionCan
                        I={NamespacePermissionActions.Edit}
                        a={NamespacePermissionSubjects.Member}
                      >
                        {(isAllowed) => (
                          <DropdownMenuItem
                            className={twMerge(
                              !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                            )}
                            onClick={() =>
                              handlePopUpOpen("namespaceMembership", {
                                membershipId: membership.id,
                                roles: membership.roles
                              })
                            }
                            disabled={!isAllowed}
                          >
                            Edit User
                          </DropdownMenuItem>
                        )}
                      </NamespacePermissionCan>
                      <NamespacePermissionCan
                        I={NamespacePermissionActions.Delete}
                        a={NamespacePermissionSubjects.Member}
                      >
                        {(isAllowed) => (
                          <DropdownMenuItem
                            className={twMerge(
                              isAllowed
                                ? "hover:!bg-red-500 hover:!text-white"
                                : "pointer-events-none cursor-not-allowed opacity-50"
                            )}
                            onClick={() => {
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
                      </NamespacePermissionCan>
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
                  <MemberRoleDetailsSection
                    membershipDetails={membership}
                    onOpenUpgradeModal={() => handlePopUpOpen("upgradePlan")}
                  />
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
          onDeleteApproved={() => onRemoveMemberSubmit()}
        />
        <UpgradePlanModal
          isOpen={popUp.upgradePlan.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
          text={(popUp.upgradePlan?.data as { description: string })?.description}
        />
      </div>
    );
  },
  {
    action: NamespacePermissionActions.Read,
    subject: NamespacePermissionSubjects.Member
  }
);

export const UserDetailsByIdPage = () => {
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
