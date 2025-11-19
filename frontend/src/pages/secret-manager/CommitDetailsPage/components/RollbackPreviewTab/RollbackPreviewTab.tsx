/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
import { useEffect, useState } from "react";
import { faFolder, faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  DeleteActionModal,
  Input,
  PageHeader,
  Spinner,
  Switch,
  Tooltip
} from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization, useProject } from "@app/context";
import {
  ProjectPermissionCommitsActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { usePopUp } from "@app/hooks";
import { useCommitRollback, useGetRollbackPreview } from "@app/hooks/api/folderCommits/queries";
import { ProjectType } from "@app/hooks/api/projects/types";

import { SecretVersionDiffView } from "../SecretVersionDiffView";

interface Version {
  // Common fields
  id?: string;
  version: number;
  createdAt?: string;
  updatedAt?: string;

  // Secret-specific fields
  secretKey?: string;
  secretValue?: string;
  secretComment?: string;
  skipMultilineEncoding?: boolean;
  secretReminderRepeatDays?: number | null;
  secretReminderNote?: string | null;
  secretReminderRecipients?: string[];
  tags?: string[];
  metadata?: Record<string, unknown>;

  // Folder-specific fields
  name?: string;
  envId?: string;
  folderId?: string;

  [key: string]: any;
}

interface RollbackChange {
  type: "secret" | "folder";
  id: string;
  versionId: string;
  fromVersion?: number;
  changeType: "create" | "update" | "delete";
  commitId: string;
  secretKey?: string;
  secretVersion?: number;
  folderName?: string;
  folderVersion?: number;
  versions?: Version[];
  createdAt?: string;
}

interface FolderChanges {
  folderId: string;
  folderName: string;
  folderPath: string;
  changes: RollbackChange[];
}

export const RollbackPreviewTab = (): JSX.Element => {
  const [deepRollback, setDeepRollback] = useState<boolean>(false);
  const [message, setMessage] = useState<string>("");
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const envSlug = useParams({
    from: ROUTE_PATHS.SecretManager.RollbackPreviewPage.id,
    select: (el) => el.environment
  });
  const selectedCommitId = useParams({
    from: ROUTE_PATHS.SecretManager.RollbackPreviewPage.id,
    select: (el) => el.commitId
  });
  const folderId = useParams({
    from: ROUTE_PATHS.SecretManager.RollbackPreviewPage.id,
    select: (el) => el.folderId
  });

  const navigate = useNavigate();
  const routerQueryParams = useSearch({
    from: ROUTE_PATHS.SecretManager.RollbackPreviewPage.id
  });

  const secretPath = (routerQueryParams.secretPath as string) || "/";

  const goBackToHistory = () => {
    navigate({
      to: "/organizations/$orgId/projects/secret-management/$projectId/commits/$environment/$folderId",
      params: {
        orgId: currentOrg.id,
        projectId: currentProject.id,
        folderId,
        environment: envSlug
      },
      search: (query) => ({
        ...query,
        secretPath
      })
    });
  };

  const { handlePopUpToggle, popUp, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "rollbackConfirm"
  ] as const);

  const { mutateAsync: rollback } = useCommitRollback({
    projectId: currentProject.id,
    commitId: selectedCommitId,
    folderId,
    deepRollback,
    environment: envSlug,
    directory: secretPath,
    envSlug
  });

  const { data: rollbackChangesNested, isLoading } = useGetRollbackPreview(
    folderId,
    selectedCommitId,
    envSlug,
    currentProject.id,
    deepRollback,
    secretPath
  );

  const handleRollback = async (): Promise<void> => {
    await rollback(message);

    createNotification({
      type: "success",
      text: "Rollback completed successfully"
    });

    handlePopUpClose("rollbackConfirm");
    goBackToHistory();
  };

  const folderChanges: FolderChanges[] = rollbackChangesNested || [];

  const currentFolderChanges: FolderChanges = folderChanges.find(
    (folder) => folder.folderId === folderId
  ) || {
    folderId: folderId || "",
    folderName: "Current Folder",
    folderPath: secretPath,
    changes: []
  };
  const nestedFolderChanges: FolderChanges[] = folderChanges.filter(
    (folder) => folder.folderId !== folderId
  );

  useEffect(() => {
    // Select the current folder by default
    if (folderChanges.length > 0) {
      setSelectedFolderId(currentFolderChanges.folderId);
    }
  }, [folderChanges, currentFolderChanges.folderId]);

  if (!selectedCommitId) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-gray-400">Select a commit to view rollback preview</p>
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

  const renderSidebar = (): JSX.Element => {
    return (
      <div className="h-[70vh] w-72 overflow-y-auto bg-mineshaft-900">
        <div
          className={`cursor-pointer border-b border-mineshaft-600 ${
            selectedFolderId === currentFolderChanges.folderId ? "bg-mineshaft-700" : ""
          }`}
          onClick={() => setSelectedFolderId(currentFolderChanges.folderId)}
        >
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center">
              <FontAwesomeIcon icon={faFolder} className="mr-2 text-yellow-500" />
              <span className="font-medium text-white">
                {currentFolderChanges.folderPath || currentFolderChanges.folderName}
              </span>
            </div>
            {currentFolderChanges.changes.length > 0 && (
              <span className="ml-2 rounded-full bg-mineshaft-600 px-2 py-0.5 text-xs text-gray-300">
                {currentFolderChanges.changes.length}
              </span>
            )}
          </div>
        </div>

        {deepRollback && nestedFolderChanges.length > 0 && (
          <>
            <div className="border-b border-mineshaft-600 bg-mineshaft-800 px-4 py-2">
              <span className="text-sm font-medium text-white">Child folders to be restored</span>
            </div>
            {nestedFolderChanges.map((folder) => (
              <div
                key={folder.folderId}
                className={`cursor-pointer border-b border-mineshaft-600 ${
                  selectedFolderId === folder.folderId ? "bg-mineshaft-700" : ""
                }`}
                onClick={() => setSelectedFolderId(folder.folderId)}
              >
                <div className="flex items-center justify-between px-4 py-2">
                  <div className="flex items-center">
                    <FontAwesomeIcon icon={faFolder} className="mr-2 text-yellow-500" size="sm" />
                    <span className="max-w-[150px] truncate text-sm font-medium text-white">
                      {folder.folderPath || folder.folderName}
                    </span>
                  </div>
                  {folder.changes.length > 0 && (
                    <span className="rounded-full bg-mineshaft-600 px-2 py-0.5 text-xs text-gray-300">
                      {folder.changes.length}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    );
  };

  const getSelectedFolderChanges = (): RollbackChange[] => {
    if (!selectedFolderId) return [];

    const folder = folderChanges.find((f) => f.folderId === selectedFolderId);
    return folder?.changes || [];
  };

  const renderMainContent = (): JSX.Element => {
    const selectedFolderChanges = getSelectedFolderChanges();
    const selectedFolder = folderChanges.find((f) => f.folderId === selectedFolderId);

    if (!selectedFolder || selectedFolderChanges.length === 0) {
      return (
        <div className="flex h-[70vh] w-full items-center justify-center border border-mineshaft-600">
          <p className="text-gray-400">No changes in selected folder</p>
        </div>
      );
    }

    return (
      <div className="h-[70vh] w-full overflow-y-auto border-l border-mineshaft-600">
        <div className="space-y-4 p-4">
          {selectedFolderChanges.map((change) => (
            <div key={change.id} className="mb-4">
              <SecretVersionDiffView
                item={{
                  id: change.id,
                  type: change.type,
                  isAdded: change.changeType === "create",
                  isDeleted: change.changeType === "delete",
                  isUpdated: change.changeType === "update",
                  versions: change.versions,
                  isRollback: true,
                  secretKey: change.secretKey,
                  folderName: change.folderName
                }}
              />
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="mx-auto flex w-full max-w-8xl justify-center bg-bunker-800 pt-2 pb-4 text-white">
      <ProjectPermissionCan
        renderGuardBanner
        I={ProjectPermissionCommitsActions.PerformRollback}
        a={ProjectPermissionSub.Commits}
      >
        <div className="w-full max-w-[75vw]">
          <div className="h-full w-full">
            <div>
              <PageHeader
                scope={ProjectType.SecretManager}
                title={`Restore folder at commit ${selectedCommitId.substring(0, 8)}`}
                description={`Will return all changes in this folder to how they appeared at the point of commit ${selectedCommitId.substring(0, 8)}. Any modifications made after this commit will be undone.`}
              />

              <div className="flex w-full border border-mineshaft-600">
                {renderSidebar()}
                {renderMainContent()}
              </div>

              <div className="border-x border-mineshaft-600 bg-mineshaft-800 px-6 py-3">
                <div className="flex items-center justify-end">
                  <div className="flex items-center">
                    <Tooltip content="Will rollback all nested folders to their state at the time of this commit">
                      <FontAwesomeIcon icon={faInfoCircle} className="mr-2 text-mineshaft-400" />
                    </Tooltip>
                    <Switch
                      className="ml-2 bg-mineshaft-400/50 shadow-inner data-[state=checked]:bg-green/50"
                      thumbClassName="bg-mineshaft-800"
                      isChecked={deepRollback}
                      onCheckedChange={setDeepRollback}
                      id="deep-rollback"
                    >
                      Restore All Child Folders
                    </Switch>
                  </div>
                </div>
              </div>

              <div className="border-t border-mineshaft-600 py-4">
                <div className="flex w-full items-center justify-between gap-2">
                  <Input
                    placeholder="Restore Message"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="w-full border-mineshaft-500 bg-mineshaft-700 py-2 text-sm"
                    maxLength={256}
                  />
                  <Button
                    onClick={() => {
                      handlePopUpOpen("rollbackConfirm");
                    }}
                    colorSchema="primary"
                    className="px-6 py-2"
                    isDisabled={
                      message.length === 0 ||
                      !rollbackChangesNested ||
                      !rollbackChangesNested?.some((folder) => {
                        return folder.changes.length > 0;
                      })
                    }
                  >
                    Restore
                  </Button>
                </div>
              </div>
            </div>

            <DeleteActionModal
              isOpen={popUp.rollbackConfirm.isOpen}
              deleteKey="restore"
              title={`Are you sure you want to restore to commit ${selectedCommitId?.substring(0, 8)}?`}
              subTitle={`
              ${
                deepRollback
                  ? "This will revert this folder and all child folders to how they appeared at the point in time of this commit."
                  : "This will revert all changes to how they appeared at the point in time of this commit."
              }
                Any changes made after this commit will be permanently removed.
            `}
              onChange={(isOpen) => handlePopUpToggle("rollbackConfirm", isOpen)}
              onDeleteApproved={handleRollback}
              buttonText="Restore"
            />
          </div>{" "}
        </div>{" "}
      </ProjectPermissionCan>
    </div>
  );
};
