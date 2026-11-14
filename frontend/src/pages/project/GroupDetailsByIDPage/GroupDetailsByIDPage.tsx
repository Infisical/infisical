import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { ChevronLeftIcon, EllipsisIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { PageTitle } from "@app/components/PageTitle";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  ConfirmationAlertDialog,
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
import { getProjectBaseURL, getProjectLabel, hidesProjects } from "@app/helpers/project";
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
      text: `Successfully removed group from ${getProjectLabel(currentProject.type).toLowerCase()}`,
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

  const productLabel = getProjectLabel(currentProject.type);

  if (isPending) {
    return (
      <div
        className="@container mx-auto flex max-w-8xl flex-col gap-5"
        role="status"
        aria-label="Loading group details"
        aria-busy="true"
      >
        <Skeleton className="h-4 w-36" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <div className="flex flex-col gap-5 @4xl:flex-row">
          <Skeleton className="h-64 w-full @4xl:max-w-[24rem] @4xl:shrink-0" />
          <Skeleton className="h-64 min-w-0 flex-1" />
        </div>
      </div>
    );
  }

  const backLinkProps = {
    to: `${getProjectBaseURL(currentProject.type)}/access-management`,
    params: {
      projectId: currentProject.id,
      orgId: currentOrg.id
    },
    search: {
      selectedTab: ProjectAccessControlTabs.Groups
    }
  } as const;
  const backLinkLabel = hidesProjects(currentProject.type) ? "Groups" : "Project Groups";

  return (
    <div className="@container mx-auto flex max-w-8xl flex-col">
      {groupMembership ? (
        <>
          <PageHeader
            scope={currentProject.type}
            title={groupMembership.group.name}
            description={`Configure and manage ${productLabel.toLowerCase()} access control`}
            backLink={
              <Link {...backLinkProps}>
                <ChevronLeftIcon aria-hidden className="size-4" />
                {backLinkLabel}
              </Link>
            }
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
          <div className="flex flex-col gap-5 @4xl:flex-row">
            <GroupDetailsSection groupMembership={groupMembership} />
            <GroupMembersSection groupMembership={groupMembership} />
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-8">
          <Link
            {...backLinkProps}
            className="flex w-fit items-center gap-1 text-sm text-muted transition-colors hover:text-foreground focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <ChevronLeftIcon aria-hidden className="size-4" />
            {backLinkLabel}
          </Link>
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>Group Not Found</EmptyTitle>
              <EmptyDescription>
                This group is unavailable or is no longer assigned to the{" "}
                {productLabel.toLowerCase()}.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      )}
      <ConfirmationAlertDialog
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
  const { currentProject } = useProject();
  const projectsHidden = hidesProjects(currentProject.type);
  return (
    <>
      <PageTitle title={projectsHidden ? "Group" : "Project Group"} />
      <link rel="icon" href="/infisical.ico" />
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
