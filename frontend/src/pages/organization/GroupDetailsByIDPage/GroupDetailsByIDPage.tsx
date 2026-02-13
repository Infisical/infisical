import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { ChevronLeftIcon, EllipsisIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { DeleteActionModal, PageHeader, Spinner } from "@app/components/v2";
import {
  Button,
  UnstableDropdownMenu,
  UnstableDropdownMenuContent,
  UnstableDropdownMenuItem,
  UnstableDropdownMenuTrigger
} from "@app/components/v3";
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

  const canEditGroup = Boolean(data && currentOrg && data.group.orgId === currentOrg.id);

  const { mutateAsync: deleteMutateAsync } = useDeleteGroup();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "groupCreateUpdate",
    "deleteGroup"
  ] as const);

  const onDeleteGroupSubmit = async ({ name, id }: { name: string; id: string }) => {
    await deleteMutateAsync({
      id,
      organizationId: currentOrg?.id
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

  if (isPending)
    return (
      <div className="flex w-full items-center justify-center p-24">
        <Spinner />
      </div>
    );

  const isInherited = data && currentOrg ? data.group.orgId !== currentOrg.id : false;

  return (
    <div className="mx-auto flex max-w-8xl flex-col">
      {data && (
        <>
          <Link
            to="/organizations/$orgId/access-management"
            params={{ orgId: currentOrg.id }}
            search={{
              selectedTab: TabSections.Groups
            }}
            className="mb-4 flex w-fit items-center gap-x-1 text-sm text-mineshaft-400 transition duration-100 hover:text-mineshaft-400/80"
          >
            <ChevronLeftIcon size={16} />
            {isSubOrganization ? "Sub-" : ""}Organization Groups
          </Link>
          <PageHeader
            scope={isSubOrganization ? "namespace" : "org"}
            description={`Configure and manage ${isSubOrganization ? "sub-" : ""}organization group`}
            title={data.group.name}
          >
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
                    navigator.clipboard.writeText(groupId);
                    createNotification({
                      text: "Group ID copied to clipboard",
                      type: "info"
                    });
                  }}
                >
                  Copy Group ID
                </UnstableDropdownMenuItem>
                {canEditGroup && (
                  <OrgPermissionCan
                    I={OrgPermissionGroupActions.Edit}
                    a={OrgPermissionSubjects.Groups}
                  >
                    {(isAllowed) => (
                      <UnstableDropdownMenuItem
                        isDisabled={!isAllowed}
                        onClick={() => {
                          handlePopUpOpen("groupCreateUpdate", {
                            groupId,
                            name: data.group.name,
                            slug: data.group.slug,
                            role: data.group.roleId || data.group.role
                          });
                        }}
                      >
                        Edit Group
                      </UnstableDropdownMenuItem>
                    )}
                  </OrgPermissionCan>
                )}
                <OrgPermissionCan
                  I={OrgPermissionGroupActions.Delete}
                  a={OrgPermissionSubjects.Groups}
                >
                  {(isAllowed) => (
                    <UnstableDropdownMenuItem
                      variant="danger"
                      isDisabled={!isAllowed}
                      onClick={() => {
                        handlePopUpOpen("deleteGroup", {
                          id: groupId,
                          name: data.group.name,
                          isInherited
                        });
                      }}
                    >
                      {isInherited ? "Unlink Group" : "Delete Group"}
                    </UnstableDropdownMenuItem>
                  )}
                </OrgPermissionCan>
              </UnstableDropdownMenuContent>
            </UnstableDropdownMenu>
          </PageHeader>
          <div className="flex flex-col gap-5 lg:flex-row">
            <GroupDetailsSection
              groupId={groupId}
              handlePopUpOpen={handlePopUpOpen}
              canEditGroup={canEditGroup}
            />
            <div className="flex flex-1 flex-col gap-y-5">
              <GroupMembersSection
                groupId={groupId}
                groupSlug={data.group.slug}
                isInherited={isInherited}
              />
              <GroupProjectsSection
                groupId={groupId}
                groupSlug={data.group.slug}
                hideAddToProject={isInherited}
              />
            </div>
          </div>
        </>
      )}
      <GroupCreateUpdateModal
        popUp={popUp}
        handlePopUpClose={handlePopUpClose}
        handlePopUpToggle={handlePopUpToggle}
      />
      <DeleteActionModal
        isOpen={popUp.deleteGroup.isOpen}
        title={
          (popUp?.deleteGroup?.data as { isInherited?: boolean })?.isInherited
            ? `Are you sure you want to unlink the group "${
                (popUp?.deleteGroup?.data as { name: string })?.name || ""
              }" from this sub-organization?`
            : `Are you sure you want to delete the group named ${
                (popUp?.deleteGroup?.data as { name: string })?.name || ""
              }?`
        }
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
