import { useCallback, useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { subject } from "@casl/ability";
import { faArrowDown, faArrowUp } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { PermissionDeniedBanner } from "@app/components/permissions";
import {
  Checkbox,
  ContentLoader,
  Modal,
  ModalContent,
  Pagination,
  Tooltip
} from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import {
  ProjectPermissionActions,
  ProjectPermissionDynamicSecretActions,
  ProjectPermissionSub,
  useProjectPermission,
  useWorkspace
} from "@app/context";
import {
  ProjectPermissionSecretActions,
  ProjectPermissionSecretRotationActions
} from "@app/context/ProjectPermissionContext/types";
import { useDebounce, usePagination, usePopUp, useResetPageHelper } from "@app/hooks";
import {
  useGetImportedSecretsSingleEnv,
  useGetSecretApprovalPolicyOfABoard,
  useGetWorkspaceSnapshotList,
  useGetWsSnapshotCount,
  useGetWsTags
} from "@app/hooks/api";
import { useGetProjectSecretsDetails } from "@app/hooks/api/dashboard";
import { DashboardSecretsOrderBy } from "@app/hooks/api/dashboard/types";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { ProjectType } from "@app/hooks/api/workspace/types";
import { hasSecretReadValueOrDescribePermission } from "@app/lib/fn/permission";
import { SecretRotationListView } from "@app/pages/secret-manager/SecretDashboardPage/components/SecretRotationListView";

import { SecretTableResourceCount } from "../OverviewPage/components/SecretTableResourceCount";
import { SecretV2MigrationSection } from "../OverviewPage/components/SecretV2MigrationSection";
import { ActionBar } from "./components/ActionBar";
import { CreateSecretForm } from "./components/CreateSecretForm";
import { DynamicSecretListView } from "./components/DynamicSecretListView";
import { FolderListView } from "./components/FolderListView";
import { PitDrawer } from "./components/PitDrawer";
import { SecretDropzone } from "./components/SecretDropzone";
import { SecretImportListView } from "./components/SecretImportListView";
import { SecretListView, SecretNoAccessListView } from "./components/SecretListView";
import { SnapshotView } from "./components/SnapshotView";
import {
  PopUpNames,
  StoreProvider,
  usePopUpAction,
  usePopUpState,
  useSelectedSecretActions,
  useSelectedSecrets
} from "./SecretMainPage.store";
import { Filter, RowType } from "./SecretMainPage.types";

const LOADER_TEXT = [
  "Retrieving your encrypted secrets...",
  "Fetching folders...",
  "Getting secret import links..."
];

const Page = () => {
  const { currentWorkspace } = useWorkspace();
  const navigate = useNavigate({
    from: ROUTE_PATHS.SecretManager.SecretDashboardPage.path
  });
  const routerQueryParams = useSearch({
    from: ROUTE_PATHS.SecretManager.SecretDashboardPage.id
  });
  const environment = useParams({
    from: ROUTE_PATHS.SecretManager.SecretDashboardPage.id,
    select: (el) => el.envSlug
  });

  const { permission } = useProjectPermission();

  const [isVisible, setIsVisible] = useState(false);

  const {
    offset,
    limit,
    orderDirection,
    setOrderDirection,
    setPage,
    perPage,
    page,
    setPerPage,
    orderBy
  } = usePagination<DashboardSecretsOrderBy>(DashboardSecretsOrderBy.Name);

  const [snapshotId, setSnapshotId] = useState<string | null>(null);
  const isRollbackMode = Boolean(snapshotId);
  const { popUp, handlePopUpClose, handlePopUpToggle } = usePopUp(["snapshots"] as const);

  // env slug
  const workspaceId = currentWorkspace?.id || "";
  const projectSlug = currentWorkspace?.slug || "";
  const secretPath = (routerQueryParams.secretPath as string) || "/";

  const canReadSecret = hasSecretReadValueOrDescribePermission(
    permission,
    ProjectPermissionSecretActions.DescribeSecret,
    {
      environment,
      secretPath,
      secretName: "*",
      secretTags: ["*"]
    }
  );

  const canReadSecretValue = hasSecretReadValueOrDescribePermission(
    permission,
    ProjectPermissionSecretActions.ReadValue,
    {
      environment,
      secretPath,
      secretName: "*",
      secretTags: ["*"]
    }
  );

  const canReadSecretImports = permission.can(
    ProjectPermissionActions.Read,
    subject(ProjectPermissionSub.SecretImports, { environment, secretPath })
  );

  const canReadDynamicSecret = permission.can(
    ProjectPermissionDynamicSecretActions.ReadRootCredential,
    subject(ProjectPermissionSub.DynamicSecrets, { environment, secretPath, metadata: ["*"] })
  );

  const canReadSecretRotations = permission.can(
    ProjectPermissionSecretRotationActions.Read,
    subject(ProjectPermissionSub.SecretRotation, { environment, secretPath })
  );

  const canDoReadRollback = permission.can(
    ProjectPermissionActions.Read,
    ProjectPermissionSub.SecretRollback
  );

  const defaultFilterState = {
    tags: {},
    searchFilter: (routerQueryParams.search as string) || "",
    // these should always be on by default for the UI, they will be disabled for the query below based off permissions
    include: {
      [RowType.Folder]: true,
      [RowType.Import]: true,
      [RowType.DynamicSecret]: true,
      [RowType.Secret]: true,
      [RowType.SecretRotation]: true
    }
  };

  const [filter, setFilter] = useState<Filter>(defaultFilterState);
  const [debouncedSearchFilter, setDebouncedSearchFilter] = useDebounce(filter.searchFilter);
  const [filterHistory, setFilterHistory] = useState<Map<string, Filter>>(new Map());

  const createSecretPopUp = usePopUpState(PopUpNames.CreateSecretForm);
  const { togglePopUp } = usePopUpAction();

  useEffect(() => {
    if (!currentWorkspace?.environments.find((env) => env.slug === environment)) {
      createNotification({
        text: "No environment found with given slug",
        type: "error"
      });
      navigate({
        to: `/${ProjectType.SecretManager}/$projectId/overview` as const,
        params: {
          projectId: workspaceId
        }
      });
    }
  }, [currentWorkspace, environment]);

  const {
    data,
    isPending: isDetailsLoading,
    isFetching: isDetailsFetching
  } = useGetProjectSecretsDetails({
    environment,
    projectId: workspaceId,
    secretPath,
    offset,
    limit,
    orderBy,
    search: debouncedSearchFilter,
    orderDirection,
    includeImports: canReadSecretImports && filter.include.import,
    includeFolders: filter.include.folder,
    viewSecretValue: canReadSecretValue,
    includeDynamicSecrets: canReadDynamicSecret && filter.include.dynamic,
    includeSecrets: canReadSecret && filter.include.secret,
    includeSecretRotations: canReadSecretRotations && filter.include.rotation,
    tags: filter.tags
  });

  const {
    imports,
    folders,
    dynamicSecrets,
    secretRotations,
    secrets,
    totalImportCount = 0,
    totalFolderCount = 0,
    totalDynamicSecretCount = 0,
    totalSecretCount = 0,
    totalCount = 0,
    importedBy,
    usedBySecretSyncs,
    totalSecretRotationCount = 0
  } = data ?? {};

  useResetPageHelper({
    totalCount,
    offset,
    setPage
  });

  // fetch imported secrets to show user the overriden ones
  const { data: importedSecrets } = useGetImportedSecretsSingleEnv({
    projectId: workspaceId,
    environment,
    path: secretPath,
    options: {
      enabled: canReadSecret
    }
  });

  // fetch tags
  const { data: tags } = useGetWsTags(
    permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.Tags) ? workspaceId : ""
  );

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

  const {
    data: snapshotCount,
    isPending: isSnapshotCountLoading,
    isFetching: isSnapshotCountFetching
  } = useGetWsSnapshotCount({
    workspaceId,
    environment,
    directory: secretPath,
    isPaused: !canDoReadRollback
  });

  const noAccessSecretCount = Math.max(
    (page * perPage > totalCount ? totalCount % perPage : perPage) -
      (imports?.length || 0) -
      (folders?.length || 0) -
      (secrets?.length || 0) -
      (dynamicSecrets?.length || 0) -
      (secretRotations?.length || 0),
    0
  );
  const isNotEmpty = Boolean(
    secrets?.length ||
      folders?.length ||
      imports?.length ||
      dynamicSecrets?.length ||
      secretRotations?.length ||
      noAccessSecretCount
  );

  const handleSortToggle = () =>
    setOrderDirection((state) =>
      state === OrderByDirection.ASC ? OrderByDirection.DESC : OrderByDirection.ASC
    );

  const handleTagToggle = useCallback(
    (tagSlug: string) =>
      setFilter((state) => {
        const isTagPresent = Boolean(state.tags?.[tagSlug]);
        const newTagFilter = { ...state.tags };
        if (isTagPresent) delete newTagFilter[tagSlug];
        else newTagFilter[tagSlug] = true;
        return { ...state, tags: newTagFilter };
      }),
    []
  );

  const handleToggleRowType = useCallback(
    (rowType: RowType) =>
      setFilter((state) => {
        return {
          ...state,
          include: {
            ...state.include,
            [rowType]: !state.include[rowType]
          }
        };
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

  useEffect(() => {
    // restore filters for path if set
    const restore = filterHistory.get(secretPath);
    setFilter(restore ?? defaultFilterState);
    setDebouncedSearchFilter(restore?.searchFilter ?? "");
  }, [secretPath]);

  useEffect(() => {
    if (!routerQueryParams.search && !routerQueryParams.tags) return;

    const queryTags = routerQueryParams.tags
      ? (routerQueryParams.tags as string).split(",").filter((tag) => Boolean(tag.trim()))
      : [];
    const updatedTags: Record<string, boolean> = {};
    queryTags.forEach((tag) => {
      updatedTags[tag] = true;
    });

    setFilter((prev) => ({
      ...prev,
      ...defaultFilterState,
      searchFilter: (routerQueryParams.search as string) ?? "",
      tags: updatedTags
    }));
    setDebouncedSearchFilter(routerQueryParams.search as string);
    // this is a temp workaround until we fully transition state to query params,
    navigate({
      search: (state) => {
        const { search, tags: qTags, ...query } = state;
        return query;
      }
    });
  }, [routerQueryParams.search, routerQueryParams.tags]);

  const selectedSecrets = useSelectedSecrets();
  const selectedSecretActions = useSelectedSecretActions();

  const allRowsSelectedOnPage = useMemo(() => {
    if (!secrets?.length) return { isChecked: false, isIndeterminate: false };

    if (secrets?.every((secret) => selectedSecrets[secret.id]))
      return { isChecked: true, isIndeterminate: false };

    if (secrets?.some((secret) => selectedSecrets[secret.id]))
      return { isChecked: true, isIndeterminate: true };

    return { isChecked: false, isIndeterminate: false };
  }, [selectedSecrets, secrets]);

  const toggleSelectAllRows = () => {
    const newChecks = { ...selectedSecrets };

    secrets?.forEach((secret) => {
      if (allRowsSelectedOnPage.isChecked) {
        delete newChecks[secret.id];
      } else {
        newChecks[secret.id] = secret;
      }
    });

    selectedSecretActions.set(newChecks);
  };

  if (isDetailsLoading) {
    return <ContentLoader text={LOADER_TEXT} />;
  }

  const handleResetFilter = () => {
    // store for breadcrumb nav to restore previously used filters
    setFilterHistory((prev) => {
      const curr = new Map(prev);
      curr.set(secretPath, filter);
      return curr;
    });

    setFilter(defaultFilterState);
    setDebouncedSearchFilter("");
  };
  return (
    <div className="container mx-auto flex max-w-7xl flex-col text-mineshaft-50 dark:[color-scheme:dark]">
      <SecretV2MigrationSection />
      {!isRollbackMode ? (
        <>
          <ActionBar
            environment={environment}
            workspaceId={workspaceId}
            projectSlug={projectSlug}
            secretPath={secretPath}
            isVisible={isVisible}
            filter={filter}
            tags={tags}
            onVisibilityToggle={handleToggleVisibility}
            onSearchChange={handleSearchChange}
            onToggleTagFilter={handleTagToggle}
            snapshotCount={snapshotCount || 0}
            isSnapshotCountLoading={isSnapshotCountLoading && isSnapshotCountFetching}
            onToggleRowType={handleToggleRowType}
            onClickRollbackMode={() => handlePopUpToggle("snapshots", true)}
            protectedBranchPolicyName={boardPolicy?.name}
            importedBy={importedBy}
            usedBySecretSyncs={usedBySecretSyncs}
          />
          <div className="thin-scrollbar mt-3 overflow-y-auto overflow-x-hidden rounded-md rounded-b-none bg-mineshaft-800 text-left text-sm text-bunker-300">
            <div className="flex flex-col" id="dashboard">
              {isNotEmpty && (
                <div
                  className={twMerge(
                    "sticky top-0 flex border-b border-mineshaft-600 bg-mineshaft-800 font-medium"
                  )}
                >
                  <Tooltip
                    className="max-w-[20rem] whitespace-nowrap"
                    content={
                      totalCount > 0
                        ? `${
                            !allRowsSelectedOnPage.isChecked ? "Select" : "Unselect"
                          } all secrets on page`
                        : ""
                    }
                  >
                    <div className="mr-[0.055rem] flex w-11 items-center justify-center pl-2.5">
                      <Checkbox
                        isDisabled={totalCount === 0}
                        id="checkbox-select-all-rows"
                        onClick={(e) => e.stopPropagation()}
                        isChecked={allRowsSelectedOnPage.isChecked}
                        isIndeterminate={allRowsSelectedOnPage.isIndeterminate}
                        onCheckedChange={toggleSelectAllRows}
                      />
                    </div>
                  </Tooltip>
                  <div
                    className="flex w-80 flex-shrink-0 items-center border-r border-mineshaft-600 py-2 pl-4"
                    role="button"
                    tabIndex={0}
                    onClick={handleSortToggle}
                    onKeyDown={(evt) => {
                      if (evt.key === "Enter") handleSortToggle();
                    }}
                  >
                    Key
                    <FontAwesomeIcon
                      icon={orderDirection === OrderByDirection.ASC ? faArrowDown : faArrowUp}
                      className="ml-2"
                    />
                  </div>
                  <div className="flex-grow px-4 py-2">Value</div>
                </div>
              )}
              {canReadSecretImports && Boolean(imports?.length) && (
                <SecretImportListView
                  searchTerm={debouncedSearchFilter}
                  secretImports={imports}
                  isFetching={isDetailsFetching}
                  environment={environment}
                  workspaceId={workspaceId}
                  secretPath={secretPath}
                  importedSecrets={importedSecrets}
                />
              )}
              {Boolean(folders?.length) && (
                <FolderListView
                  folders={folders}
                  environment={environment}
                  workspaceId={workspaceId}
                  secretPath={secretPath}
                  onNavigateToFolder={handleResetFilter}
                />
              )}
              {canReadDynamicSecret && Boolean(dynamicSecrets?.length) && (
                <DynamicSecretListView
                  environment={environment}
                  projectSlug={projectSlug}
                  secretPath={secretPath}
                  dynamicSecrets={dynamicSecrets}
                />
              )}
              {canReadSecretRotations && Boolean(secretRotations?.length) && (
                <SecretRotationListView secretRotations={secretRotations} />
              )}
              {canReadSecret && Boolean(secrets?.length) && (
                <SecretListView
                  secrets={secrets}
                  tags={tags}
                  isVisible={isVisible}
                  environment={environment}
                  workspaceId={workspaceId}
                  secretPath={secretPath}
                  isProtectedBranch={isProtectedBranch}
                  importedBy={importedBy}
                  usedBySecretSyncs={usedBySecretSyncs}
                />
              )}
              {noAccessSecretCount > 0 && <SecretNoAccessListView count={noAccessSecretCount} />}
              {!canReadSecret &&
                !canReadDynamicSecret &&
                !canReadSecretImports &&
                folders?.length === 0 && <PermissionDeniedBanner />}
            </div>
          </div>
          {!isDetailsLoading && totalCount > 0 && (
            <Pagination
              startAdornment={
                <SecretTableResourceCount
                  dynamicSecretCount={totalDynamicSecretCount}
                  importCount={totalImportCount}
                  secretCount={totalSecretCount}
                  folderCount={totalFolderCount}
                  secretRotationCount={totalSecretRotationCount}
                />
              }
              className="rounded-b-md border-t border-solid border-t-mineshaft-600"
              count={totalCount}
              page={page}
              perPage={perPage}
              onChangePage={(newPage) => setPage(newPage)}
              onChangePerPage={(newPerPage) => setPerPage(newPerPage)}
            />
          )}
          <Modal
            isOpen={createSecretPopUp.isOpen}
            onOpenChange={(state) => togglePopUp(PopUpNames.CreateSecretForm, state)}
          >
            <ModalContent
              title="Create Secret"
              subTitle="Add a secret to this particular environment and folder"
              bodyClassName="overflow-visible"
            >
              <CreateSecretForm
                environment={environment}
                workspaceId={workspaceId}
                secretPath={secretPath}
                autoCapitalize={currentWorkspace?.autoCapitalization}
                isProtectedBranch={isProtectedBranch}
              />
            </ModalContent>
          </Modal>
          <SecretDropzone
            environment={environment}
            workspaceId={workspaceId}
            secretPath={secretPath}
            isSmaller={isNotEmpty}
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
  );
};

export const SecretDashboardPage = () => {
  const { t } = useTranslation();

  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: t("dashboard.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content={String(t("dashboard.og-title"))} />
        <meta name="og:description" content={String(t("dashboard.og-description"))} />
      </Helmet>
      <div className="h-full">
        <StoreProvider>
          <Page />
        </StoreProvider>
      </div>
    </>
  );
};
