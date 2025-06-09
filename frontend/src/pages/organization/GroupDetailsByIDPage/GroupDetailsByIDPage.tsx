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
  Spinner,
  Tooltip
} from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { OrgPermissionGroupActions, OrgPermissionSubjects } from "@app/context";
import { useDeleteGroup } from "@app/hooks/api";
import { useGetGroupById } from "@app/hooks/api/groups/queries";
import { usePopUp } from "@app/hooks/usePopUp";

import { GroupCreateUpdateModal } from "./components/GroupCreateUpdateModal";
import { GroupDetailsSection } from "./components/GroupDetailsSection";
import { GroupMembersSection } from "./components/GroupMembersSection";

export enum TabSections {
  Member = "members",
  Groups = "groups",
  Roles = "roles",
  Identities = "identities"
}

const Page = () => {
  const navigate = useNavigate();
  const params = useParams({
    from: ROUTE_PATHS.Organization.GroupDetailsByIDPage.id
  });
  const groupId = params.groupId as string;

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
        to: "/organization/access-management" as const,
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
        <div className="mx-auto mb-6 w-full max-w-7xl">
          <PageHeader title={data.group.name}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild className="rounded-lg">
                <div className="hover:text-primary-400 data-[state=open]:text-primary-400">
                  <Tooltip content="More options">
                    <Button variant="outline_bg">More</Button>
                  </Tooltip>
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="p-1">
                <OrgPermissionCan
                  I={OrgPermissionGroupActions.Edit}
                  a={OrgPermissionSubjects.Groups}
                >
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
                  I={OrgPermissionGroupActions.Delete}
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
          </PageHeader>
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
        title={`Are you sure you want to delete the group named ${
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
};

export const GroupDetailsByIDPage = () => {
  const { t } = useTranslation();
  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: t("settings.org.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <OrgPermissionCan
        passThrough={false}
        I={OrgPermissionGroupActions.Read}
        a={OrgPermissionSubjects.Groups}
      >
        <Page />
      </OrgPermissionCan>
    </>
  );
};
