import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { ChevronLeftIcon, EllipsisIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { DeleteActionModal, EmptyState, PageHeader, Spinner } from "@app/components/v2";
import {
  Button,
  UnstableDropdownMenu,
  UnstableDropdownMenuContent,
  UnstableDropdownMenuItem,
  UnstableDropdownMenuTrigger
} from "@app/components/v3";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useOrganization,
  useProject
} from "@app/context";
import { getProjectBaseURL } from "@app/helpers/project";
import { usePopUp } from "@app/hooks";
import { useDeleteGroupFromWorkspace } from "@app/hooks/api";
import { useGetWorkspaceGroupMembershipDetails } from "@app/hooks/api/projects/queries";
import { ProjectAccessControlTabs } from "@app/types/project";

import { GroupDetailsSection } from "./components/GroupDetailsSection";
import { GroupMembersSection } from "./components/GroupMembersSection";

const Page = () => {
  const groupId = useParams({
    strict: false,
    select: (el) => el.groupId as string
  });

  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();

  const { data: groupMembership, isPending } = useGetWorkspaceGroupMembershipDetails(
    currentProject.id,
    groupId
  );

  const { mutateAsync: deleteMutateAsync } = useDeleteGroupFromWorkspace();
  const navigate = useNavigate();

  const { handlePopUpToggle, popUp, handlePopUpClose, handlePopUpOpen } = usePopUp([
    "deleteGroup"
  ] as const);

  const onRemoveGroupSubmit = async () => {
    await deleteMutateAsync({
      groupId: groupMembership!.group.id,
      projectId: currentProject.id
    });

    createNotification({
      text: "Successfully removed group from project",
      type: "success"
    });

    navigate({
      to: `${getProjectBaseURL(currentProject.type)}/access-management`,
      params: {
        projectId: currentProject.id
      },
      search: {
        selectedTab: "groups"
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

  return (
    <div className="mx-auto flex max-w-8xl flex-col">
      {groupMembership ? (
        <>
          <Link
            to={`${getProjectBaseURL(currentProject.type)}/access-management`}
            params={{
              projectId: currentProject.id,
              orgId: currentOrg.id
            }}
            search={{
              selectedTab: ProjectAccessControlTabs.Groups
            }}
            className="mb-4 flex w-fit items-center gap-x-1 text-sm text-mineshaft-400 transition duration-100 hover:text-mineshaft-400/80"
          >
            <ChevronLeftIcon size={16} />
            Project Groups
          </Link>
          <PageHeader
            scope={currentProject.type}
            title={groupMembership.group.name}
            description="Configure and manage project access control"
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
                    navigator.clipboard.writeText(groupMembership.group.id);
                    createNotification({
                      text: "Group ID copied to clipboard",
                      type: "info"
                    });
                  }}
                >
                  Copy Group ID
                </UnstableDropdownMenuItem>

                <ProjectPermissionCan
                  I={ProjectPermissionActions.Delete}
                  a={ProjectPermissionSub.Groups}
                >
                  {(isAllowed) => (
                    <UnstableDropdownMenuItem
                      variant="danger"
                      isDisabled={!isAllowed}
                      onClick={() => handlePopUpOpen("deleteGroup")}
                    >
                      Remove From Project
                    </UnstableDropdownMenuItem>
                  )}
                </ProjectPermissionCan>
              </UnstableDropdownMenuContent>
            </UnstableDropdownMenu>
          </PageHeader>
          <div className="flex flex-col gap-5 lg:flex-row">
            <GroupDetailsSection groupMembership={groupMembership} />
            <GroupMembersSection groupMembership={groupMembership} />
          </div>
        </>
      ) : (
        <EmptyState title="Error: Unable to find the group." className="py-12" />
      )}
      <DeleteActionModal
        isOpen={popUp.deleteGroup.isOpen}
        title={`Are you sure you want to remove the group ${
          groupMembership?.group.name
        } from the project?`}
        onChange={(isOpen) => handlePopUpToggle("deleteGroup", isOpen)}
        deleteKey="confirm"
        buttonText="Remove"
        onDeleteApproved={onRemoveGroupSubmit}
      />
    </div>
  );
};

export const GroupDetailsByIDPage = () => {
  const { t } = useTranslation();
  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: "Project Group" })}</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <ProjectPermissionCan
        I={ProjectPermissionActions.Read}
        a={ProjectPermissionSub.Groups}
        passThrough={false}
        renderGuardBanner
      >
        <Page />
      </ProjectPermissionCan>
    </>
  );
};
