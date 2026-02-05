import { useEffect, useState } from "react";
import {
  faAngleDown,
  faChevronLeft,
  faCodeCommit,
  faInfoCircle,
  faWarning
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { DropdownMenuItem } from "@radix-ui/react-dropdown-menu";
import { useSearch } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  ContentLoader,
  DeleteActionModal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  EmptyState,
  PageHeader,
  Tooltip
} from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import {
  ProjectPermissionCommitsActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { usePopUp } from "@app/hooks";
import { ActorType } from "@app/hooks/api/auditLogs/enums";
import { CommitWithChanges } from "@app/hooks/api/folderCommits";
import { useCommitRevert, useGetCommitDetails } from "@app/hooks/api/folderCommits/queries";
import { ProjectType } from "@app/hooks/api/projects/types";
import { CommitType } from "@app/hooks/api/types";

import { SecretVersionDiffView } from "../SecretVersionDiffView";
import { MergedItem } from "./types";

const formatDisplayDate = (dateString: string): string => {
  try {
    const date = new Date(dateString);
    const options: Intl.DateTimeFormatOptions = {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      hour12: true
    };
    return new Intl.DateTimeFormat("en-US", options).format(date);
  } catch {
    return dateString;
  }
};

export const CommitDetailsTab = ({
  selectedCommitId,
  projectId,
  envSlug,
  goBackToHistory,
  goToRollbackPreview
}: {
  selectedCommitId: string;
  projectId: string;
  envSlug: string;
  goBackToHistory: () => void;
  goToRollbackPreview: () => void;
}): JSX.Element => {
  // State for tracking collapsed items (empty by default means all are expanded)
  const [collapsedItems, setCollapsedItems] = useState<Record<string, boolean>>({});

  const { handlePopUpToggle, popUp, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "revertChanges"
  ] as const);

  const { data: commitDetails, isLoading } = useGetCommitDetails(projectId, selectedCommitId);

  const routerQueryParams: { secretPath?: string } = useSearch({
    from: ROUTE_PATHS.SecretManager.CommitDetailsPage.id
  });
  const secretPath = (routerQueryParams.secretPath as string) || "/";

  const { mutateAsync: revert } = useCommitRevert({
    commitId: selectedCommitId,
    projectId,
    environment: envSlug,
    directory: secretPath
  });

  useEffect(() => {
    setCollapsedItems({});
  }, [selectedCommitId]);

  const toggleItemCollapsed = (itemId: string): void => {
    setCollapsedItems((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  const handleRevertChanges = async (): Promise<void> => {
    const response = await revert();
    if (!response.success) {
      createNotification({
        type: "error",
        text: response.message
      });
      return;
    }
    createNotification({
      type: "success",
      text: response.message
    });

    handlePopUpClose("revertChanges");

    goBackToHistory();
  };

  // If no commit is selected or data is loading, show appropriate message
  if (!selectedCommitId) {
    return (
      <EmptyState className="mt-40" title="Select a commit to view details." icon={faCodeCommit}>
        <Button className="mt-4" colorSchema="secondary" onClick={() => goBackToHistory()}>
          Back to Commits
        </Button>
      </EmptyState>
    );
  }

  if (isLoading) {
    return <ContentLoader />;
  }

  if (!commitDetails) {
    return (
      <EmptyState className="mt-40" title="No details found for this commit." icon={faCodeCommit}>
        <Button className="mt-4" colorSchema="secondary" onClick={() => goBackToHistory()}>
          Back to Commits
        </Button>
      </EmptyState>
    );
  }

  // Parse the commit details if it's a string
  let parsedCommitDetails: CommitWithChanges;
  try {
    parsedCommitDetails =
      typeof commitDetails === "string" ? JSON.parse(commitDetails) : commitDetails;
  } catch (error) {
    console.error("Failed to parse commit details:", error);
    return (
      <EmptyState className="mt-40" title="Error parsing commit details." icon={faWarning}>
        <Button className="mt-4" colorSchema="secondary" onClick={() => goBackToHistory()}>
          Back to Commits
        </Button>
      </EmptyState>
    );
  }

  // Get all changes from the commit
  const commitChanges = parsedCommitDetails.changes?.changes || [];

  // Separate changes by type
  const addedChanges = commitChanges.filter((c) => c.changeType === CommitType.ADD && !c.isUpdate);
  const updatedChanges = commitChanges.filter((c) => c.changeType === CommitType.ADD && c.isUpdate);
  const deletedChanges = commitChanges.filter((c) => c.changeType === CommitType.DELETE);

  // Create merged item list from changes only
  const changedItems: MergedItem[] = [];

  // Add items from added changes
  addedChanges.forEach((change) => {
    changedItems.push({
      id: change.id,
      type: change.secretVersionId || change.secretKey ? "secret" : "folder",
      versionId: change.secretVersionId || change.id,
      folderName: change.folderName,
      folderVersion: change.folderVersion,
      secretKey: change.secretKey,
      secretVersion: change.secretVersion,
      isAdded: true,
      versions: change.versions,
      changeId: change.id
    });
  });

  // Add items from updated changes
  updatedChanges.forEach((change) => {
    changedItems.push({
      id: change.id,
      type: change.secretVersionId || change.secretKey ? "secret" : "folder",
      versionId: change.secretVersionId || change.id,
      folderName: change.folderName,
      folderVersion: change.folderVersion,
      secretKey: change.secretKey,
      secretVersion: change.secretVersion,
      isUpdated: true,
      versions: change.versions,
      changeId: change.id
    });
  });

  // Add deleted items
  deletedChanges.forEach((change) => {
    changedItems.push({
      id: change.id,
      type: change.secretVersionId || change.secretKey ? "secret" : "folder",
      secretKey: change.secretKey,
      folderName: change.folderName,
      secretVersion: change.secretVersion,
      folderVersion: change.folderVersion,
      isDeleted: true,
      versions: change.versions,
      changeId: change.id
    });
  });

  // Sort items: deleted first, then folders, then secrets, all alphabetically
  const sortedChangedItems = [...changedItems].sort((a, b) => {
    // First sort deleted items to the top
    if (a.isDeleted !== b.isDeleted) {
      return a.isDeleted ? -1 : 1;
    }

    // Then sort by type (folders before secrets)
    if (a.type !== b.type) {
      return a.type === "folder" ? -1 : 1;
    }

    // Finally sort alphabetically by name
    const aName = a.type === "folder" ? a.folderName || "" : a.secretKey || "";
    const bName = b.type === "folder" ? b.folderName || "" : b.secretKey || "";
    return aName.localeCompare(bName);
  });

  // Render an item from the merged list
  const renderMergedItem = (item: MergedItem): JSX.Element => {
    return (
      <SecretVersionDiffView
        key={item.id}
        item={item}
        isCollapsed={collapsedItems[item.id]}
        onToggleCollapse={(id) => toggleItemCollapsed(id)}
      />
    );
  };

  // Format actor display
  const actorDisplay =
    parsedCommitDetails.changes?.actorMetadata?.name ||
    parsedCommitDetails.changes?.actorType ||
    "Unknown";

  return (
    <>
      <Button
        variant="link"
        type="submit"
        leftIcon={<FontAwesomeIcon icon={faChevronLeft} />}
        onClick={() => {
          goBackToHistory();
        }}
      >
        Commit History
      </Button>
      <PageHeader
        scope={ProjectType.SecretManager}
        title={`${parsedCommitDetails.changes?.message}` || "No message"}
        description={
          <div className="flex items-center gap-2">
            <div>
              Commited by {actorDisplay === ActorType.PLATFORM ? "Platform" : actorDisplay} on{" "}
              {formatDisplayDate(
                parsedCommitDetails.changes?.createdAt || new Date().toISOString()
              )}
              {parsedCommitDetails.changes?.isLatest && (
                <span className="ml-1 text-mineshaft-400">(Latest)</span>
              )}
            </div>
            {actorDisplay === ActorType.PLATFORM && (
              <Tooltip content="This commit was automatically generated by the platform as part of an automated event.">
                <FontAwesomeIcon icon={faInfoCircle} />
              </Tooltip>
            )}
          </div>
        }
      >
        <ProjectPermissionCan
          I={ProjectPermissionCommitsActions.PerformRollback}
          a={ProjectPermissionSub.Commits}
        >
          {(isAllowed) => (
            <DropdownMenu>
              <DropdownMenuTrigger
                asChild
                disabled={!isAllowed}
                className={`${!isAllowed ? "cursor-not-allowed" : ""}`}
              >
                <Button
                  rightIcon={<FontAwesomeIcon className="ml-2" icon={faAngleDown} />}
                  variant="solid"
                  className="h-min"
                  colorSchema="secondary"
                >
                  Restore Options
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-w-sm bg-bunker-500" sideOffset={2}>
                {!parsedCommitDetails.changes.isLatest && (
                  <DropdownMenuItem
                    className="group cursor-pointer border-b border-mineshaft-600 px-3 py-3 transition-colors hover:bg-mineshaft-700"
                    onClick={() => goToRollbackPreview()}
                  >
                    <div className="flex items-center space-x-3">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-white">
                          Roll back to this commit
                        </span>
                        <span className="text-xs leading-snug break-words whitespace-normal text-gray-400">
                          Return this folder to its exact state at the time of this commit,
                          discarding all other changes made after it
                        </span>
                      </div>
                    </div>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  className="group cursor-pointer px-3 py-3 transition-colors hover:bg-mineshaft-700"
                  onClick={() => handlePopUpOpen("revertChanges")}
                >
                  <div className="flex items-center space-x-3">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-white">Revert changes</span>
                      <span className="text-xs leading-snug break-words whitespace-normal text-gray-400">
                        Will restore to the previous version of affected resources
                      </span>
                    </div>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </ProjectPermissionCan>
      </PageHeader>
      <div className="flex w-full flex-col rounded-lg border border-mineshaft-600 bg-mineshaft-900 pt-4">
        <div className="mx-4 flex items-center justify-between border-b border-mineshaft-400 pb-4">
          <h3 className="text-lg font-medium text-mineshaft-100">Commit Changes</h3>
        </div>
        <div className="flex flex-col overflow-hidden px-4">
          <div className="thin-scrollbar overflow-y-auto py-4">
            {sortedChangedItems.length > 0 ? (
              sortedChangedItems.map((item) => renderMergedItem(item))
            ) : (
              <EmptyState
                title="No changes found."
                className="h-full pt-28 pb-0"
                icon={faCodeCommit}
              />
            )}
          </div>
        </div>
      </div>
      <DeleteActionModal
        isOpen={popUp.revertChanges.isOpen}
        deleteKey="revert"
        title="Are you sure you want to revert all changes made in this commit?"
        subTitle="This will undo all changes made in this commit."
        onChange={(isOpen) => handlePopUpToggle("revertChanges", isOpen)}
        onDeleteApproved={handleRevertChanges}
        buttonText="Yes, revert changes"
      />
    </>
  );
};
