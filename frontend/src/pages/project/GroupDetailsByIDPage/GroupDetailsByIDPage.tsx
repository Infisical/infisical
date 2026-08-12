import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { ChevronLeftIcon, EllipsisIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
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
        className="mx-auto flex max-w-8xl flex-col gap-5"
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

  return (
    <div className="mx-auto flex max-w-8xl flex-col">
      <Link
        to={`${getProjectBaseURL(currentProject.type)}/access-management`}
        params={{
          projectId: currentProject.id,
          orgId: currentOrg.id
        }}
        search={{
          selectedTab: ProjectAccessControlTabs.Groups
        }}
        className="mb-4 flex w-fit items-center gap-x-1 text-sm text-muted transition-colors hover:text-foreground focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <ChevronLeftIcon size={16} />
        {isCertManager ? "Groups" : "Project Groups"}
      </Link>
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
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>Group Not Found</EmptyTitle>
            <EmptyDescription>
              This group is unavailable or is no longer assigned to the {productLabel.toLowerCase()}
              .
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      <AlertDialog
        open={popUp.deleteGroup.isOpen}
        onOpenChange={(isOpen) => {
          if (!isRemovingGroup) handlePopUpToggle("deleteGroup", isOpen);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove &quot;{groupMembership?.group.name}&quot; from {productLabel}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This removes the group&apos;s access to this {productLabel.toLowerCase()}. You can add
              the group again later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel isDisabled={isRemovingGroup}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              isPending={isRemovingGroup}
              isDisabled={!groupMembership}
              onClick={async (event) => {
                event.preventDefault();
                await onRemoveGroupSubmit();
              }}
            >
              Remove Group
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
