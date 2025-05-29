import { useEffect, useState } from "react";
import { faAngleDown } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { DropdownMenuItem } from "@radix-ui/react-dropdown-menu";
import { useSearch } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  DeleteActionModal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  IconButton,
  Spinner
} from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import {
  ProjectPermissionCommitsActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { usePopUp } from "@app/hooks";
import { CommitWithChanges } from "@app/hooks/api/folderCommits";
import { useCommitRevert, useGetCommitDetails } from "@app/hooks/api/folderCommits/queries";
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
  workspaceId,
  envSlug,
  goBackToHistory,
  goToRollbackPreview
}: {
  selectedCommitId: string;
  workspaceId: string;
  envSlug: string;
  goBackToHistory: () => void;
  goToRollbackPreview: () => void;
}): JSX.Element => {
  // State for tracking collapsed items (empty by default means all are expanded)
  const [collapsedItems, setCollapsedItems] = useState<Record<string, boolean>>({});

  const { handlePopUpToggle, popUp, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "revertChanges"
  ] as const);

  const { data: commitDetails, isLoading } = useGetCommitDetails(workspaceId, selectedCommitId);

  const routerQueryParams: { secretPath?: string } = useSearch({
    from: ROUTE_PATHS.SecretManager.CommitDetailsPage.id
  });
  const secretPath = (routerQueryParams.secretPath as string) || "/";

  const { mutateAsync: revert } = useCommitRevert({
    commitId: selectedCommitId,
    projectId: workspaceId,
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
      <div className="flex h-64 items-center justify-center">
        <p className="text-gray-400">Select a commit to view details</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!commitDetails) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-gray-400">No details found for this commit</p>
      </div>
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
      <div className="flex h-64 items-center justify-center">
        <p className="text-gray-400">Error parsing commit details</p>
      </div>
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
      <div key={item.id} className="mb-2">
        <SecretVersionDiffView
          item={item}
          isCollapsed={collapsedItems[item.id]}
          onToggleCollapse={(id) => toggleItemCollapsed(id)}
        />
      </div>
    );
  };

  // Format actor display
  const actorDisplay =
    parsedCommitDetails.changes?.actorMetadata?.name ||
    parsedCommitDetails.changes?.actorType ||
    "Unknown";

  return (
    <div className="w-full">
      <div>
        <div className="flex justify-between pb-2">
          <div className="w-5/6">
            <div>
              <div className="flex items-center">
                <h1 className="mr-4 truncate text-3xl font-semibold text-white">
                  {parsedCommitDetails.changes?.message || "No message"}
                </h1>
              </div>
            </div>
            <div className="font-small mb-4 mt-2 flex items-center text-sm">
              <p>
                <span> Commited by </span>
                <b>{actorDisplay}</b>
                <span> on </span>
                <b>
                  {formatDisplayDate(
                    parsedCommitDetails.changes?.createdAt || new Date().toISOString()
                  )}
                </b>
                {parsedCommitDetails.changes?.isLatest && (
                  <span className="ml-1 italic text-gray-400">(Latest)</span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-start">
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
                    <IconButton
                      ariaLabel="commit-options"
                      variant="outline_bg"
                      className="h-10 rounded border border-mineshaft-600 bg-mineshaft-800 px-4 py-2 text-sm font-medium"
                    >
                      <p className="mr-2">Restore Options</p>
                      <FontAwesomeIcon icon={faAngleDown} />
                    </IconButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    sideOffset={2}
                    className="animate-in fade-in-50 zoom-in-95 min-w-[240px] rounded-md bg-mineshaft-800 p-1 shadow-lg"
                    style={{ marginTop: "0" }}
                  >
                    {!parsedCommitDetails.changes.isLatest && (
                      <DropdownMenuItem
                        className="group cursor-pointer rounded-md px-3 py-3 transition-colors hover:bg-mineshaft-700"
                        onClick={() => goToRollbackPreview()}
                      >
                        <div className="flex items-center space-x-3">
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-white">
                              Roll back to this commit
                            </span>
                            <span className="max-w-[180px] whitespace-normal break-words text-xs leading-snug text-gray-400">
                              Return this folder to its exact state at the time of this commit,
                              discarding all other changes made after it
                            </span>
                          </div>
                        </div>
                      </DropdownMenuItem>
                    )}

                    <DropdownMenuItem
                      className="group cursor-pointer rounded-md px-3 py-3 transition-colors hover:bg-mineshaft-700"
                      onClick={() => handlePopUpOpen("revertChanges")}
                    >
                      <div className="flex items-center space-x-3">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-white">Revert changes</span>
                          <span className="max-w-[180px] whitespace-normal break-words text-xs leading-snug text-gray-400">
                            Will restore to the previous version of affected resources
                          </span>
                        </div>
                      </div>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </ProjectPermissionCan>
          </div>
        </div>

        <div className="py-2">
          <div className="overflow-hidden">
            <div className="space-y-2">
              {sortedChangedItems.length > 0 ? (
                sortedChangedItems.map((item) => renderMergedItem(item))
              ) : (
                <div className="flex h-32 items-center justify-center rounded-lg border border-mineshaft-600 bg-mineshaft-800">
                  <p className="text-gray-400">No changed items found</p>
                </div>
              )}
            </div>
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
    </div>
  );
};
