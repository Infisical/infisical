import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useRouter } from "next/router";
import { subject } from "@casl/ability";
import { faArrowDown, faArrowUp } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import NavHeader from "@app/components/navigation/NavHeader";
import { PermissionDeniedBanner } from "@app/components/permissions";
import { ContentLoader } from "@app/components/v2";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useProjectPermission,
  useWorkspace
} from "@app/context";
import { usePopUp } from "@app/hooks";
import {
  useGetImportedSecrets,
  useGetProjectFolders,
  useGetProjectSecrets,
  useGetSecretApprovalPolicyOfABoard,
  useGetSecretImports,
  useGetUserWsKey,
  useGetWorkspaceSnapshotList,
  useGetWsSnapshotCount,
  useGetWsTags
} from "@app/hooks/api";

import { ActionBar } from "./components/ActionBar";
import { CreateSecretForm } from "./components/CreateSecretForm";
import { FolderListView } from "./components/FolderListView";
import { PitDrawer } from "./components/PitDrawer";
import { SecretDropzone } from "./components/SecretDropzone";
import { SecretImportListView } from "./components/SecretImportListView";
import { SecretListView } from "./components/SecretListView";
import { SnapshotView } from "./components/SnapshotView";
import { StoreProvider } from "./SecretMainPage.store";
import { Filter, GroupBy, SortDir } from "./SecretMainPage.types";

const LOADER_TEXT = [
  "Retrieving your encrypted secrets...",
  "Fetching folders...",
  "Getting secret import links..."
];

export const SecretMainPage = () => {
  const { t } = useTranslation();
  const { currentWorkspace } = useWorkspace();
  const router = useRouter();
  const permission = useProjectPermission();

  const [isVisible, setIsVisible] = useState(false);
  const [sortDir, setSortDir] = useState<SortDir>(SortDir.ASC);
  const [filter, setFilter] = useState<Filter>({
    tags: {},
    searchFilter: ""
  });

  const [snapshotId, setSnapshotId] = useState<string | null>(null);
  const isRollbackMode = Boolean(snapshotId);
  const { popUp, handlePopUpClose, handlePopUpToggle } = usePopUp(["snapshots"] as const);

  // env slug
  const environment = router.query.env as string;
  const workspaceId = currentWorkspace?._id || "";
  const secretPath = (router.query.secretPath as string) || "/";
  const canReadSecret = permission.can(
    ProjectPermissionActions.Read,
    subject(ProjectPermissionSub.Secrets, { environment, secretPath })
  );
  const canDoReadRollback = permission.can(
    ProjectPermissionActions.Read,
    ProjectPermissionSub.SecretRollback
  );

  const { data: decryptFileKey } = useGetUserWsKey(workspaceId);

  // fetch secrets
  const { data: secrets, isLoading: isSecretsLoading } = useGetProjectSecrets({
    environment,
    workspaceId,
    secretPath,
    decryptFileKey: decryptFileKey!,
    options: {
      enabled: canReadSecret
    }
  });
  // fetch folders
  const { data: folders, isLoading: isFoldersLoading } = useGetProjectFolders({
    workspaceId,
    environment,
    directory: secretPath
  });
  // fetch secret imports
  const {
    data: secretImports,
    isLoading: isSecretImportsLoading,
    isFetching: isSecretImportsFetching
  } = useGetSecretImports({
    workspaceId,
    environment,
    directory: secretPath,
    options: {
      enabled: canReadSecret
    }
  });

  // fetch imported secrets to show user the overriden ones
  const { data: importedSecrets } = useGetImportedSecrets({
    workspaceId,
    environment,
    decryptFileKey: decryptFileKey!,
    directory: secretPath,
    options: {
      enabled: canReadSecret
    }
  });
  // fetch tags
  const { data: tags } = useGetWsTags(canReadSecret ? workspaceId : "");

  const { data: boardPolicy } = useGetSecretApprovalPolicyOfABoard({
    workspaceId,
    environment,
    secretPath
  });
  const isProtectedBranch = Boolean(boardPolicy);

  const {
    data: snapshotList,
    isFetchingNextPage: isFetchingNextSnapshotList,
    fetchNextPage: fetchNextSnapshotList,
    hasNextPage: hasNextSnapshotListPage
  } = useGetWorkspaceSnapshotList({
    workspaceId,
    directory: secretPath,
    environment,
    isPaused: !popUp.snapshots.isOpen || !canDoReadRollback,
    limit: 10
  });

  const { data: snapshotCount, isLoading: isSnapshotCountLoading } = useGetWsSnapshotCount({
    workspaceId,
    environment,
    directory: secretPath,
    isPaused: !canDoReadRollback
  });

  const isNotEmtpy = Boolean(secrets?.length || folders?.length || secretImports?.imports?.length);

  const handleSortToggle = () =>
    setSortDir((state) => (state === SortDir.ASC ? SortDir.DESC : SortDir.ASC));

  const handleEnvChange = (slug: string) => {
    const query: Record<string, string> = { ...router.query, env: slug };
    delete query.secretPath;
    router.push({
      pathname: router.pathname,
      query
    });
  };

  const handleGroupByChange = useCallback(
    (groupBy?: GroupBy) => setFilter((state) => ({ ...state, groupBy })),
    []
  );

  const handleTagToggle = useCallback(
    (tagId: string) =>
      setFilter((state) => {
        const isTagPresent = Boolean(state.tags?.[tagId]);
        const newTagFilter = { ...state.tags };
        if (isTagPresent) delete newTagFilter[tagId];
        else newTagFilter[tagId] = true;
        return { ...state, tags: newTagFilter };
      }),
    []
  );

  const handleSearchChange = useCallback(
    (searchFilter: string) => setFilter((state) => ({ ...state, searchFilter })),
    []
  );

  const handleToggleVisibility = useCallback(() => setIsVisible((state) => !state), []);

  // snapshot functions
  const handleSelectSnapshot = useCallback((snapId: string) => {
    setSnapshotId(snapId);
  }, []);

  const handleResetSnapshot = useCallback(() => {
    setSnapshotId(null);
    handlePopUpClose("snapshots");
  }, []);

  // loading screen when u have permission
  const loadingOnAccess =
    canReadSecret && (isSecretsLoading || isSecretImportsLoading || isFoldersLoading);
  // loading screen when you don't have permission but as folder's is viewable need to wait for that
  const loadingOnDenied = !canReadSecret && isFoldersLoading;
  if (loadingOnAccess || loadingOnDenied) {
    return <ContentLoader text={LOADER_TEXT} />;
  }

  return (
    <StoreProvider>
      <div className="container flex flex-col mx-auto h-full px-6 text-mineshaft-50 dark:[color-scheme:dark]">
        <div className="relative right-6 -top-2 mb-2 ml-6">
          <NavHeader
            pageName={t("dashboard.title")}
            currentEnv={environment}
            userAvailableEnvs={currentWorkspace?.environments}
            isFolderMode
            secretPath={secretPath}
            isProjectRelated
            onEnvChange={handleEnvChange}
            isProtectedBranch={isProtectedBranch}
            protectionPolicyName={boardPolicy?.name}
          />
        </div>
        {!isRollbackMode ? (
          <>
            <ActionBar
              secrets={secrets}
              importedSecrets={importedSecrets}
              environment={environment}
              workspaceId={workspaceId}
              secretPath={secretPath}
              isVisible={isVisible}
              filter={filter}
              tags={tags}
              onVisiblilityToggle={handleToggleVisibility}
              onGroupByChange={handleGroupByChange}
              onSearchChange={handleSearchChange}
              onToggleTagFilter={handleTagToggle}
              snapshotCount={snapshotCount || 0}
              isSnapshotCountLoading={isSnapshotCountLoading}
              onClickRollbackMode={() => handlePopUpToggle("snapshots", true)}
            />
            <div className="mt-3 overflow-y-auto overflow-x-hidden thin-scrollbar bg-mineshaft-800 text-left text-bunker-300 rounded-md text-sm">
              <div className="flex flex-col" id="dashboard">
                {isNotEmtpy && (
                  <div className="flex font-medium border-b border-mineshaft-600">
                    <div style={{ width: "2.8rem" }} className="px-4 py-3 flex-shrink-0" />
                    <div
                      className="w-80 flex-shrink-0 border-r flex items-center border-mineshaft-600 px-4 py-2"
                      role="button"
                      tabIndex={0}
                      onClick={handleSortToggle}
                      onKeyDown={(evt) => {
                        if (evt.key === "Enter") handleSortToggle();
                      }}
                    >
                      Key
                      <FontAwesomeIcon
                        icon={sortDir === SortDir.ASC ? faArrowDown : faArrowUp}
                        className="ml-2"
                      />
                    </div>
                    <div className="flex-grow px-4 py-2">Value</div>
                  </div>
                )}
                {canReadSecret && (
                  <SecretImportListView
                    searchTerm={filter.searchFilter}
                    secretImports={secretImports}
                    isFetching={isSecretImportsLoading || isSecretImportsFetching}
                    environment={environment}
                    workspaceId={workspaceId}
                    secretPath={secretPath}
                    secrets={secrets}
                    importedSecrets={importedSecrets}
                  />
                )}
                <FolderListView
                  folders={folders}
                  environment={environment}
                  workspaceId={workspaceId}
                  secretPath={secretPath}
                  sortDir={sortDir}
                />
                {canReadSecret && (
                  <SecretListView
                    secrets={secrets}
                    tags={tags}
                    filter={filter}
                    sortDir={sortDir}
                    isVisible={isVisible}
                    environment={environment}
                    workspaceId={workspaceId}
                    secretPath={secretPath}
                    decryptFileKey={decryptFileKey!}
                    isProtectedBranch={isProtectedBranch}
                  />
                )}
                {!canReadSecret && folders?.length === 0 && <PermissionDeniedBanner />}
              </div>
            </div>
            <CreateSecretForm
              environment={environment}
              workspaceId={workspaceId}
              decryptFileKey={decryptFileKey!}
              secretPath={secretPath}
              autoCapitalize={currentWorkspace?.autoCapitalization}
              isProtectedBranch={isProtectedBranch}
            />
            <SecretDropzone
              secrets={secrets}
              environment={environment}
              workspaceId={workspaceId}
              decryptFileKey={decryptFileKey!}
              secretPath={secretPath}
              isSmaller={isNotEmtpy}
              environments={currentWorkspace?.environments}
              isProtectedBranch={isProtectedBranch}
            />
            <PitDrawer
              secretSnaphots={snapshotList}
              snapshotId={snapshotId}
              isDrawerOpen={popUp.snapshots.isOpen}
              onOpenChange={(isOpen) => handlePopUpToggle("snapshots", isOpen)}
              hasNextPage={hasNextSnapshotListPage}
              fetchNextPage={fetchNextSnapshotList}
              onSelectSnapshot={handleSelectSnapshot}
              isFetchingNextPage={isFetchingNextSnapshotList}
            />
          </>
        ) : (
          <SnapshotView
            snapshotId={snapshotId || ""}
            decryptFileKey={decryptFileKey!}
            environment={environment}
            workspaceId={workspaceId}
            secretPath={secretPath}
            secrets={secrets}
            folders={folders}
            snapshotCount={snapshotCount}
            onGoBack={handleResetSnapshot}
            onClickListSnapshot={() => handlePopUpToggle("snapshots", true)}
          />
        )}
      </div>
    </StoreProvider>
  );
};
