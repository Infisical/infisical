import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { ChevronLeftIcon, EllipsisIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  DeleteConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  PageHeader,
  Skeleton
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
import { ProjectType } from "@app/hooks/api/projects/types";
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
    groupId,
    currentProject.type
  );

  const { mutateAsync: deleteMutateAsync, isPending: isRemovingGroup } =
    useDeleteGroupFromWorkspace();
  const navigate = useNavigate();

  const { handlePopUpToggle, popUp, handlePopUpClose, handlePopUpOpen } = usePopUp([
    "deleteGroup"
  ] as const);

  const onRemoveGroupSubmit = async () => {
    if (!groupMembership) return;

    try {
      await deleteMutateAsync({
        groupId: groupMembership.group.id,
        projectId: currentProject.id,
        projectType: currentProject.type
      });
    } catch {
      return;
    }

    createNotification({
      text: `Successfully removed group from ${
        currentProject.type === ProjectType.CertificateManager ? "certificate manager" : "project"
      }`,
      type: "success"
    });

    handlePopUpClose("deleteGroup");

    navigate({
      to: `${getProjectBaseURL(currentProject.type)}/access-management`,
      params: {
        orgId: currentOrg.id,
        projectId: currentProject.id
      },
      search: {
        selectedTab: ProjectAccessControlTabs.Groups
      }
    });
  };

  const isCertManager = currentProject.type === ProjectType.CertificateManager;
  const productLabel = isCertManager ? "Certificate Manager" : "Project";

  if (isPending) {
    return (
      <div
        className="mx-auto flex max-w-8xl flex-col"
        role="status"
        aria-label="Loading group details"
        aria-busy="true"
      >
        <Skeleton className="h-4 w-36" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <div className="flex flex-col gap-5 lg:flex-row">
          <Skeleton className="h-64 w-full lg:max-w-[24rem]" />
          <Skeleton className="h-64 flex-1" />
        </div>
      </div>
    );
  }

  const groupsBackLink = (
    <Link
      to={`${getProjectBaseURL(currentProject.type)}/access-management`}
      params={{
        projectId: currentProject.id,
        orgId: currentOrg.id
      }}
      search={{
        selectedTab: ProjectAccessControlTabs.Groups
      }}
    >
      <ChevronLeftIcon aria-hidden className="size-4" />
      {isCertManager ? "Groups" : "Project Groups"}
    </Link>
  );

  return (
    <div className="mx-auto flex max-w-8xl flex-col gap-8">
      {groupMembership ? (
        <>
          <PageHeader
            scope={currentProject.type}
            title={groupMembership.group.name}
            description={
              isCertManager
                ? "Configure and manage certificate manager access control"
                : "Configure and manage project access control"
            }
            backLink={groupsBackLink}
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  Options
                  <EllipsisIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => {
                    navigator.clipboard.writeText(groupMembership.group.id);
                    createNotification({
                      text: "Group ID copied to clipboard",
                      type: "info"
                    });
                  }}
                >
                  Copy Group ID
                </DropdownMenuItem>

                <ProjectPermissionCan
                  I={ProjectPermissionActions.Delete}
                  a={ProjectPermissionSub.Groups}
                >
                  {(isAllowed) => (
                    <DropdownMenuItem
                      variant="danger"
                      isDisabled={!isAllowed}
                      onClick={() => handlePopUpOpen("deleteGroup")}
                    >
                      Remove From {productLabel}
                    </DropdownMenuItem>
                  )}
                </ProjectPermissionCan>
              </DropdownMenuContent>
            </DropdownMenu>
          </PageHeader>
          <div className="flex flex-col gap-5 lg:flex-row">
            <GroupDetailsSection groupMembership={groupMembership} />
            <GroupMembersSection groupMembership={groupMembership} />
          </div>
        </>
      ) : (
        <>
          <PageHeader
            scope={currentProject.type}
            title="Group Not Found"
            backLink={groupsBackLink}
          />
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>Group Not Found</EmptyTitle>
              <EmptyDescription>
                This group is unavailable or is no longer assigned to the{" "}
                {productLabel.toLowerCase()}.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </>
      )}
      <DeleteConfirmDialog
        isOpen={popUp.deleteGroup.isOpen}
        onOpenChange={(isOpen) => {
          if (!isRemovingGroup) handlePopUpToggle("deleteGroup", isOpen);
        }}
        title={`Remove "${groupMembership?.group.name}" from ${productLabel}?`}
        description={`This removes the group's access to this ${productLabel.toLowerCase()}. You can add the group again later.`}
        confirmKey={groupMembership?.group.name ?? ""}
        confirmLabel="Remove Group"
        isPending={isRemovingGroup}
        onConfirm={onRemoveGroupSubmit}
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
