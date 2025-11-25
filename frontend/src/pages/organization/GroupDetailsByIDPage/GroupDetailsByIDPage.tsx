import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { faChevronLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { twMerge } from "tailwind-merge";

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
import { OrgPermissionGroupActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import { useDeleteGroup } from "@app/hooks/api";
import { useGetGroupById } from "@app/hooks/api/groups/queries";
import { usePopUp } from "@app/hooks/usePopUp";

import { GroupCreateUpdateModal } from "./components/GroupCreateUpdateModal";
import { GroupDetailsSection } from "./components/GroupDetailsSection";
import { GroupMembersSection } from "./components/GroupMembersSection";
import { GroupProjectsSection } from "./components/GroupProjectsSection";

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

  const { isSubOrganization, currentOrg } = useOrganization();

  const { mutateAsync: deleteMutateAsync } = useDeleteGroup();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "groupCreateUpdate",
    "deleteGroup"
  ] as const);

  const onDeleteGroupSubmit = async ({ name, id }: { name: string; id: string }) => {
    await deleteMutateAsync({
      id
    });
    createNotification({
      text: `Successfully deleted the ${name} group`,
      type: "success"
    });
    navigate({
      to: "/organizations/$orgId/access-management" as const,
      params: { orgId: currentOrg.id },
      search: {
        selectedTab: TabSections.Groups
      }
    });

    handlePopUpClose("deleteGroup");
  };

  if (isPending) return <Spinner size="sm" className="mt-2 ml-2" />;

  return (
    <div className="mx-auto flex flex-col justify-between bg-bunker-800 text-white">
      {data && (
        <div className="mx-auto w-full max-w-8xl">
          <Link
            to="/organizations/$orgId/access-management"
            params={{ orgId: currentOrg.id }}
            search={{
              selectedTab: TabSections.Groups
            }}
            className="mb-4 flex items-center gap-x-2 text-sm text-mineshaft-400"
          >
            <FontAwesomeIcon icon={faChevronLeft} />
            Organization Groups
          </Link>
          <PageHeader
            scope={isSubOrganization ? "namespace" : "org"}
            description={`${isSubOrganization ? "Sub-" : ""}Organization Group`}
            title={data.group.name}
          >
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
                          ? "hover:bg-red-500! hover:text-white!"
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
          <div className="flex flex-col gap-4 md:flex-row">
            <div className="w-full md:w-96">
              <GroupDetailsSection groupId={groupId} handlePopUpOpen={handlePopUpOpen} />
            </div>
            <div className="flex grow flex-col gap-4">
              <GroupMembersSection groupId={groupId} groupSlug={data.group.slug} />
              <GroupProjectsSection groupId={groupId} groupSlug={data.group.slug} />
            </div>
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
