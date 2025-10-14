import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { twMerge } from "tailwind-merge";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { NamespacePermissionCan } from "@app/components/permissions";
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
import {
  NamespacePermissionActions,
  NamespacePermissionMemberActions,
  NamespacePermissionSubjects
} from "@app/context/NamespacePermissionContext/types";
import { withNamespacePermission } from "@app/hoc";
import {} from "@app/hooks/api";
import {
  namespaceUserMembershipQueryKeys,
  useDeleteNamespaceUserMembership
} from "@app/hooks/api/namespaceUserMembership";
import { usePopUp } from "@app/hooks/usePopUp";
import { OrgAccessControlTabSections } from "@app/types/org";

import { MemberRoleDetailsSection } from "./components/MemberRoleDetailsSection";
import { UserDetailsSection } from "./components";

const Page = withNamespacePermission(
  () => {
    const navigate = useNavigate();
    const search = useParams({
      from: ROUTE_PATHS.Namespace.UserDetailsByIDPage.id
    });

    const userId = search.userId as string;
    const { user } = useUser();
    const { namespaceId } = useNamespace();

    const currentUserId = user?.id || "";

    const { data: membership } = useQuery(
      namespaceUserMembershipQueryKeys.detail({
        userId,
        namespaceId
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
          userId,
          namespaceId
        });

        createNotification({
          text: "Successfully removed user from org",
          type: "success"
        });

        handlePopUpClose("removeMember");
        navigate({
          to: "/organization/namespaces/$namespaceId/access-management" as const,
          params: {
            namespaceId
          },
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
              scope="namespace"
              title={
                membership.user.firstName || membership.user.lastName
                  ? `${membership.user.firstName} ${membership.user.lastName ?? ""}`.trim()
                  : "-"
              }
            >
              <div>
                {currentUserId !== membership.user.id && (
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
                    <DropdownMenuContent align="end" sideOffset={5} className="p-1">
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
                                orgMembershipId: userId,
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
                <UserDetailsSection userId={userId} handlePopUpOpen={handlePopUpOpen} />
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
    action: NamespacePermissionMemberActions.Read,
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
