import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { faChevronLeft, faEllipsis } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
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
  Spinner,
  Tooltip
} from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import { withPermission } from "@app/hoc";
import { useDeleteGroup } from "@app/hooks/api";
import { useGetGroupById } from "@app/hooks/api/groups/queries";
import { usePopUp } from "@app/hooks/usePopUp";

import { GroupCreateUpdateModal } from "./-components/GroupCreateUpdateModal";
import { GroupMembersSection } from "./-components/GroupMembersSection";
import { GroupDetailsSection } from "./-components";

export enum TabSections {
  Member = "members",
  Groups = "groups",
  Roles = "roles",
  Identities = "identities"
}

const GroupPage = withPermission(
  () => {
    const navigate = useNavigate();
    const params = useParams({
      from: "/_authenticate/_ctx-org-details/organization/_layout-org/$organizationId/groups/$groupId/"
    });
    const groupId = params.groupId as string;
    const { currentOrg } = useOrganization();

    const { data, isPending } = useGetGroupById(groupId);

    const { mutateAsync: deleteMutateAsync } = useDeleteGroup();

    const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
      "groupCreateUpdate",
      "deleteGroup",
      "upgradePlan"
    ] as const);

    const onDeleteGroupSubmit = async ({ name, id }: { name: string; id: string }) => {
      try {
        await deleteMutateAsync({
          id
        });
        createNotification({
          text: `Successfully deleted the ${name} group`,
          type: "success"
        });
        navigate({
          to: "/organization/$organizationId/members" as const,
          params: {
            organizationId: currentOrg.id
          },
          search: {
            selectedTab: TabSections.Groups
          }
        });
      } catch (err) {
        console.error(err);
        createNotification({
          text: `Failed to delete the ${name} group`,
          type: "error"
        });
      }

      handlePopUpClose("deleteGroup");
    };

    if (isPending) return <Spinner size="sm" className="ml-2 mt-2" />;

    return (
      <div className="container mx-auto flex flex-col justify-between bg-bunker-800 text-white">
        {data && (
          <div className="mx-auto mb-6 w-full max-w-7xl px-6 py-6">
            <Button
              variant="link"
              type="submit"
              leftIcon={<FontAwesomeIcon icon={faChevronLeft} />}
              onClick={() => {
                navigate({
                  to: "/organization/$organizationId/members" as const,
                  params: {
                    organizationId: currentOrg.id
                  },
                  search: {
                    selectedTab: TabSections.Groups
                  }
                });
              }}
              className="mb-4"
            >
              Groups
            </Button>
            <div className="mb-4 flex items-center justify-between">
              <p className="text-3xl font-semibold text-white">{data.group.name}</p>
              <DropdownMenu>
                <DropdownMenuTrigger asChild className="rounded-lg">
                  <div className="hover:text-primary-400 data-[state=open]:text-primary-400">
                    <Tooltip content="More options">
                      <FontAwesomeIcon size="sm" icon={faEllipsis} />
                    </Tooltip>
                  </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="p-1">
                  <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Groups}>
                    {(isAllowed) => (
                      <DropdownMenuItem
                        className={twMerge(
                          !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                        )}
                        onClick={async () => {
                          handlePopUpOpen("groupCreateUpdate", {
                            groupId,
                            name: data.group.name,
                            slug: data.group.slug,
                            role: data.group.role
                          });
                        }}
                        disabled={!isAllowed}
                      >
                        Edit Group
                      </DropdownMenuItem>
                    )}
                  </OrgPermissionCan>
                  <OrgPermissionCan
                    I={OrgPermissionActions.Delete}
                    a={OrgPermissionSubjects.Groups}
                  >
                    {(isAllowed) => (
                      <DropdownMenuItem
                        className={twMerge(
                          isAllowed
                            ? "hover:!bg-red-500 hover:!text-white"
                            : "pointer-events-none cursor-not-allowed opacity-50"
                        )}
                        onClick={async () => {
                          handlePopUpOpen("deleteGroup", {
                            id: groupId,
                            name: data.group.name
                          });
                        }}
                        disabled={!isAllowed}
                      >
                        Delete Group
                      </DropdownMenuItem>
                    )}
                  </OrgPermissionCan>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="flex">
              <div className="mr-4 w-96">
                <GroupDetailsSection groupId={groupId} handlePopUpOpen={handlePopUpOpen} />
              </div>
              <GroupMembersSection groupId={groupId} groupSlug={data.group.slug} />
            </div>
          </div>
        )}
        <GroupCreateUpdateModal
          popUp={popUp}
          handlePopUpClose={handlePopUpClose}
          handlePopUpToggle={handlePopUpToggle}
        />
        <DeleteActionModal
          isOpen={popUp.deleteGroup.isOpen}
          title={`Are you sure want to delete the group named ${
            (popUp?.deleteGroup?.data as { name: string })?.name || ""
          }?`}
          onChange={(isOpen) => handlePopUpToggle("deleteGroup", isOpen)}
          deleteKey="confirm"
          onDeleteApproved={() =>
            onDeleteGroupSubmit(popUp?.deleteGroup?.data as { name: string; id: string })
          }
        />
        <UpgradePlanModal
          isOpen={popUp.upgradePlan.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
          text={(popUp.upgradePlan?.data as { description: string })?.description}
        />
      </div>
    );
  },
  { action: OrgPermissionActions.Read, subject: OrgPermissionSubjects.Groups }
);

const GroupDetailPage = () => {
  const { t } = useTranslation();
  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: t("settings.org.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <GroupPage />
    </>
  );
};

export const Route = createFileRoute(
  "/_authenticate/_ctx-org-details/organization/_layout-org/$organizationId/groups/$groupId/"
)({
  component: GroupDetailPage
});
