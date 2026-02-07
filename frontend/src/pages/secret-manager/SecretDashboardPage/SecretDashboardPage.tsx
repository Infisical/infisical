/* eslint-disable no-case-declarations */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { subject } from "@casl/ability";
import {
  faArrowDown,
  faArrowUp,
  faChevronLeft,
  faInfoCircle
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { PermissionDeniedBanner } from "@app/components/permissions";
import {
  Button,
  Checkbox,
  ContentLoader,
  Modal,
  ModalContent,
  PageHeader,
  Pagination,
  Tooltip
} from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import {
  ProjectPermissionActions,
  ProjectPermissionDynamicSecretActions,
  ProjectPermissionSub,
  useOrganization,
  useProject,
  useProjectPermission
} from "@app/context";
import {
  ProjectPermissionCommitsActions,
  ProjectPermissionSecretActions,
  ProjectPermissionSecretRotationActions
} from "@app/context/ProjectPermissionContext/types";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { useDebounce, usePagination, usePopUp, useResetPageHelper } from "@app/hooks";
import {
  useGetImportedSecretsSingleEnv,
  useGetSecretApprovalPolicyOfABoard,
  useGetWorkspaceSnapshotList,
  useGetWsSnapshotCount,
  useGetWsTags
} from "@app/hooks/api";
import { useGetProjectSecretsDetails } from "@app/hooks/api/dashboard";
import { dashboardKeys } from "@app/hooks/api/dashboard/queries";
import { DashboardSecretsOrderBy } from "@app/hooks/api/dashboard/types";
import { useGetFolderCommitsCount } from "@app/hooks/api/folderCommits";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { ProjectType, ProjectVersion } from "@app/hooks/api/projects/types";
import { queryClient } from "@app/hooks/api/reactQuery";
import { PendingAction } from "@app/hooks/api/secretFolders/types";
import { useCreateCommit } from "@app/hooks/api/secrets/mutations";
import { SecretV3RawSanitized } from "@app/hooks/api/types";
import { usePathAccessPolicies } from "@app/hooks/usePathAccessPolicies";
import { useResizableColWidth } from "@app/hooks/useResizableColWidth";
import { hasSecretReadValueOrDescribePermission } from "@app/lib/fn/permission";
import { RequestAccessModal } from "@app/pages/secret-manager/SecretApprovalsPage/components/AccessApprovalRequest/components/RequestAccessModal";
import { SecretRotationListView } from "@app/pages/secret-manager/SecretDashboardPage/components/SecretRotationListView";

import { SecretTableResourceCount } from "../OverviewPage/components/SecretTableResourceCount";
import { SecretV2MigrationSection } from "../OverviewPage/components/SecretV2MigrationSection";
import { ActionBar } from "./components/ActionBar";
import { CommitForm } from "./components/CommitForm";
import { CreateSecretForm } from "./components/CreateSecretForm";
import { DynamicSecretListView } from "./components/DynamicSecretListView";
import { EnvironmentTabs } from "./components/EnvironmentTabs";
import { FolderBreadCrumbs } from "./components/FolderBreadCrumbs";
import { FolderListView } from "./components/FolderListView";
import { PitDrawer } from "./components/PitDrawer";
import { SecretDropzone } from "./components/SecretDropzone";
import { SecretImportListView } from "./components/SecretImportListView";
import { SecretListView, SecretNoAccessListView } from "./components/SecretListView";
import { SnapshotView } from "./components/SnapshotView";
import {
  PendingChanges,
  PopUpNames,
  StoreProvider,
  useBatchMode,
  useBatchModeActions,
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
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
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
  const { mutateAsync: createCommit, isPending: isCommitPending } = useCreateCommit();

  const tableRef = useRef<HTMLTableElement>(null);

  const [isVisible, setIsVisible] = useState(false);
  const [selectedDynamicSecretId, setSelectedDynamicSecretId] = useState<string | null>(
    routerQueryParams.dynamicSecretId || ""
  );
  const { isBatchMode, pendingChanges } = useBatchMode();
  const { loadPendingChanges, setExistingKeys } = useBatchModeActions();

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
  } = usePagination<DashboardSecretsOrderBy>(DashboardSecretsOrderBy.Name, {
    initPerPage: getUserTablePreference("secretDashboardTable", PreferenceKey.PerPage, 100)
  });

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference("secretDashboardTable", PreferenceKey.PerPage, newPerPage);
  };

  const [snapshotId, setSnapshotId] = useState<string | null>(null);
  const isRollbackMode = Boolean(snapshotId);
  const { popUp, handlePopUpClose, handlePopUpToggle, handlePopUpOpen } = usePopUp([
    "snapshots",
    "requestAccess"
  ] as const);

  // env slug
  const projectId = currentProject?.id || "";
  const projectSlug = currentProject?.slug || "";
  const secretPath = (routerQueryParams.secretPath as string) || "/";

  useEffect(() => {
    if (isBatchMode && projectId && environment && secretPath) {
      loadPendingChanges({ projectId, environment, secretPath });
    }
  }, [isBatchMode, projectId, environment, secretPath, loadPendingChanges]);

  useEffect(() => {
    if (isVisible) setIsVisible(false);
  }, [environment]);

  useEffect(() => {
    if (routerQueryParams.dynamicSecretId !== null) {
      setSelectedDynamicSecretId(routerQueryParams.dynamicSecretId);

      navigate({
        search: (prev) => ({
          ...prev,
          dynamicSecretId: undefined
        })
      });

      // if any of the router query params are changed, we have to clear the selected dynamic secret id to avoid re-rendering the lease modal when it suddendly becomes available
    } else {
      setSelectedDynamicSecretId(null);
    }
  }, [
    routerQueryParams.filterBy,
    routerQueryParams.search,
    routerQueryParams.secretPath,
    routerQueryParams.tags
  ]);

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

  const canEditSecrets = permission.can(
    ProjectPermissionSecretActions.Edit,
    subject(ProjectPermissionSub.Secrets, {
      environment,
      secretPath,
      secretName: "*",
      secretTags: ["*"]
    })
  );

  const canDeleteSecrets = permission.can(
    ProjectPermissionSecretActions.Delete,
    subject(ProjectPermissionSub.Secrets, {
      environment,
      secretPath,
      secretName: "*",
      secretTags: ["*"]
    })
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

  const canReadCommits = permission.can(
    ProjectPermissionCommitsActions.Read,
    ProjectPermissionSub.Commits
  );

  const getFilterStateFromQueryParams = useCallback(() => {
    const filterByArray = routerQueryParams.filterBy
      ? (routerQueryParams.filterBy as string).split(",").filter(Boolean)
      : [];

    const includeFilters = {
      [RowType.Folder]: filterByArray.includes("folder") || false,
      [RowType.Import]: filterByArray.includes("import") || false,
      [RowType.DynamicSecret]: filterByArray.includes("dynamic") || false,
      [RowType.Secret]: filterByArray.includes("secret") || false,
      [RowType.SecretRotation]: filterByArray.includes("rotation") || false
    };

    const tags = routerQueryParams.tags
      ? routerQueryParams.tags.split(",").reduce(
          (acc, tag) => {
            const trimmedTag = tag.trim();
            if (trimmedTag) {
              acc[trimmedTag] = true;
            }
            return acc;
          },
          {} as Record<string, boolean>
        )
      : {};

    return {
      tags,
      searchFilter: (routerQueryParams.search as string) || "",
      include: includeFilters
    };
  }, [routerQueryParams.search, routerQueryParams.tags, routerQueryParams.filterBy]);

  const defaultFilterState = getFilterStateFromQueryParams();

  const [filter, setFilter] = useState<Filter>(defaultFilterState);
  const [debouncedSearchFilter, setDebouncedSearchFilter] = useDebounce(filter.searchFilter);

  const createSecretPopUp = usePopUpState(PopUpNames.CreateSecretForm);
  const { togglePopUp } = usePopUpAction();

  useEffect(() => {
    if (!currentProject?.environments.find((env) => env.slug === environment)) {
      createNotification({
        text: "No environment found with given slug",
        type: "error"
      });
      navigate({
        to: "/organizations/$orgId/projects/secret-management/$projectId/overview",
        params: {
          orgId: currentOrg.id,
          projectId
        }
      });
    }
  }, [currentProject, environment]);

  const isResourceTypeFiltered = Object.values(filter.include).some(Boolean);
  const {
    data,
    isPending: isDetailsLoading,
    isFetching: isDetailsFetching,
    isFetched
  } = useGetProjectSecretsDetails({
    environment,
    projectId,
    secretPath,
    offset,
    limit,
    orderBy,
    search: debouncedSearchFilter,
    orderDirection,
    includeImports: canReadSecretImports && (isResourceTypeFiltered ? filter.include.import : true),
    includeFolders: isResourceTypeFiltered ? filter.include.folder : true,
    includeDynamicSecrets:
      canReadDynamicSecret && (isResourceTypeFiltered ? filter.include.dynamic : true),
    includeSecrets: canReadSecret && (isResourceTypeFiltered ? filter.include.secret : true),
    includeSecretRotations:
      canReadSecretRotations && (isResourceTypeFiltered ? filter.include.rotation : true),
    tags: filter.tags
  });

  useEffect(() => {
    // if switching tabs in a folder path that doesn't exist in a separate env we navigate to the root
    if (!data && isFetched) {
      navigate({
        search: (prev) => ({
          ...prev,
          secretPath: "/"
        })
      });
    }
  }, [data, isFetched]);

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
    projectId,
    environment,
    path: secretPath,
    options: {
      enabled: canReadSecret
    }
  });

  // fetch tags
  const { data: tags } = useGetWsTags(
    permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.Tags) ? projectId : ""
  );

  const { pathPolicies, hasPathPolicies } = usePathAccessPolicies({ secretPath, environment });

  const { data: boardPolicy } = useGetSecretApprovalPolicyOfABoard({
    projectId,
    environment,
    secretPath
  });
  const isProtectedBranch = Boolean(boardPolicy);

  const handleCreateCommit = async (changes: PendingChanges, message: string) => {
    await createCommit({
      projectId,
      environment,
      secretPath,
      pendingChanges: changes,
      message
    });

    // Check if there are only folder changes (no secret changes)
    // Folder changes are not affected by approval policies, so they're saved directly
    const hasOnlyFolderChanges = changes.folders.length > 0 && changes.secrets.length === 0;
    const requiresApproval = isProtectedBranch && !hasOnlyFolderChanges;

    if (!requiresApproval) {
      changes.secrets.forEach((secret) => {
        if (secret.type === "update" && secret.secretValue !== undefined) {
          queryClient.setQueryData(
            dashboardKeys.getSecretValue({
              projectId,
              environment,
              secretPath,
              secretKey: secret.newSecretName ?? secret.secretKey,
              isOverride: false
            }),
            { value: secret.secretValue }
          );
        }
      });
    }

    createNotification({
      text: requiresApproval
        ? "Requested changes have been sent for review"
        : "Changes saved successfully",
      type: "success"
    });
  };

  const {
    data: snapshotList,
    isFetchingNextPage: isFetchingNextSnapshotList,
    fetchNextPage: fetchNextSnapshotList,
    hasNextPage: hasNextSnapshotListPage
  } = useGetWorkspaceSnapshotList({
    projectId,
    directory: secretPath,
    environment,
    isPaused: !popUp.snapshots.isOpen || !canDoReadRollback,
    limit: 10
  });

  const {
    data: { count: folderCommitsCount, folderId } = { count: 0, folderId: "" },
    isPending: isFolderCommitsCountLoading,
    isFetching: isFolderCommitsCountFetching
  } = useGetFolderCommitsCount({
    directory: secretPath,
    projectId,
    environment,
    isPaused: !canReadCommits
  });

  const {
    data: snapshotCount,
    isPending: isSnapshotCountLoading,
    isFetching: isSnapshotCountFetching
  } = useGetWsSnapshotCount({
    projectId,
    environment,
    directory: secretPath,
    isPaused: !canDoReadRollback
  });

  const isPITEnabled = !currentProject?.showSnapshotsLegacy;

  const changesCount = useMemo(() => {
    return isPITEnabled ? folderCommitsCount : snapshotCount;
  }, [folderCommitsCount, snapshotCount]);

  const isChangesCountPending = useMemo(() => {
    return isPITEnabled ? isFolderCommitsCountLoading || isSnapshotCountLoading : false;
  }, [isFolderCommitsCountLoading, isSnapshotCountLoading]);

  const isChangesCountFetching = useMemo(() => {
    return isPITEnabled ? isFolderCommitsCountFetching || isSnapshotCountFetching : false;
  }, [isFolderCommitsCountFetching, isSnapshotCountFetching]);

  const handleOnClickRollbackMode = () => {
    if (isPITEnabled) {
      navigate({
        to: "/organizations/$orgId/projects/secret-management/$projectId/commits/$environment/$folderId",
        params: {
          orgId: currentOrg.id,
          projectId,
          folderId,
          environment
        },
        search: (query) => ({
          ...query,
          secretPath
        })
      });
    } else {
      handlePopUpToggle("snapshots", true);
    }
  };

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
      noAccessSecretCount ||
      pendingChanges.secrets.length ||
      pendingChanges.folders.length
  );

  useEffect(() => {
    if (data && isBatchMode) {
      const existingSecretKeys = [...(secrets?.map((s) => s.key) || [])];

      const existingFolderNames = folders?.map((f) => f.name) || [];

      setExistingKeys(existingSecretKeys, existingFolderNames);
    }
  }, [data, isBatchMode, setExistingKeys, secrets, importedSecrets, folders]);

  const handleSortToggle = () =>
    setOrderDirection((state) =>
      state === OrderByDirection.ASC ? OrderByDirection.DESC : OrderByDirection.ASC
    );

  const handleTagToggle = useCallback(
    (tagSlug: string) => {
      setFilter((state) => {
        const isTagPresent = Boolean(state.tags?.[tagSlug]);
        const newTagFilter = { ...state.tags };
        if (isTagPresent) delete newTagFilter[tagSlug];
        else newTagFilter[tagSlug] = true;

        // Update URL to match filter state
        const tagsList = Object.keys(newTagFilter).filter((tag) => newTagFilter[tag]);
        navigate({
          search: (prev) => ({
            ...prev,
            tags: tagsList.length > 0 ? tagsList.join(",") : ""
          })
        });

        return { ...state, tags: newTagFilter };
      });
    },
    [navigate]
  );

  const handleToggleRowType = useCallback(
    (rowType: RowType) => {
      setFilter((state) => {
        const newInclude = {
          ...state.include,
          [rowType]: !state.include[rowType]
        };

        // Update URL to match filter state
        const filterByList: string[] = [];
        if (newInclude[RowType.Folder]) filterByList.push("folder");
        if (newInclude[RowType.Import]) filterByList.push("import");
        if (newInclude[RowType.DynamicSecret]) filterByList.push("dynamic");
        if (newInclude[RowType.Secret]) filterByList.push("secret");
        if (newInclude[RowType.SecretRotation]) filterByList.push("rotation");

        navigate({
          search: (prev) => ({
            ...prev,
            filterBy: filterByList.length > 0 ? filterByList.join(",") : ""
          })
        });

        return {
          ...state,
          include: newInclude
        };
      });
    },
    [navigate]
  );

  const handleClearFilters = useCallback(() => {
    setFilter({
      searchFilter: "",
      tags: {},
      include: {
        [RowType.Folder]: false,
        [RowType.Import]: false,
        [RowType.DynamicSecret]: false,
        [RowType.Secret]: false,
        [RowType.SecretRotation]: false
      }
    });
    setDebouncedSearchFilter("");
    navigate({
      search: (prev) => ({
        ...prev,
        search: "",
        tags: "",
        filterBy: ""
      })
    });
  }, [navigate]);

  const handleSearchChange = useCallback(
    (searchFilter: string) => {
      setFilter((state) => ({ ...state, searchFilter }));

      // Update URL to match filter state
      navigate({
        search: (prev) => ({
          ...prev,
          search: searchFilter || ""
        })
      });
    },
    [navigate]
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

  const { handleMouseDown, isResizing, colWidth } = useResizableColWidth({
    initialWidth: 320,
    minWidth: 100,
    maxWidth: tableRef.current
      ? tableRef.current.clientWidth - 148 // ensure value column can't collapse completely
      : 800,
    ref: tableRef
  });

  useEffect(() => {
    const filterState = getFilterStateFromQueryParams();
    setFilter(filterState);
    setDebouncedSearchFilter(filterState.searchFilter);
  }, [getFilterStateFromQueryParams]);

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
      // bulk actions don't apply to rotation secrets (move/delete)
      if (secret.isRotatedSecret) return;

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
    setFilter(defaultFilterState);
    setDebouncedSearchFilter("");
  };

  const getMergedSecretsWithPending = (
    paramSecrets?: (SecretV3RawSanitized | null)[]
  ): SecretV3RawSanitized[] => {
    const sanitizedParamSecrets = paramSecrets?.filter(Boolean) as
      | SecretV3RawSanitized[]
      | undefined;
    if (!isBatchMode || pendingChanges.secrets.length === 0) {
      return sanitizedParamSecrets || secrets || [];
    }

    const mergedSecrets = [...(sanitizedParamSecrets || secrets || [])] as (SecretV3RawSanitized & {
      originalKey?: string;
    })[];

    pendingChanges.secrets.forEach((change) => {
      switch (change.type) {
        case PendingAction.Create:
          mergedSecrets.unshift({
            id: change.id,
            key: change.secretKey,
            value: change.secretValue,
            comment: change.secretComment || "",
            skipMultilineEncoding: change.skipMultilineEncoding || false,
            tags: change.tags || [],
            secretMetadata: change.secretMetadata || [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            version: 1,
            isPending: true,
            pendingAction: PendingAction.Create
          } as unknown as SecretV3RawSanitized);
          break;

        case PendingAction.Update:
          const updateIndex = mergedSecrets.findIndex((s) => s.key === change.secretKey);
          if (updateIndex >= 0) {
            mergedSecrets[updateIndex] = {
              ...mergedSecrets[updateIndex],
              key: change.newSecretName || change.secretKey,
              value:
                change.secretValue !== undefined
                  ? change.secretValue
                  : mergedSecrets[updateIndex].value,
              comment:
                change.secretComment !== undefined
                  ? change.secretComment
                  : mergedSecrets[updateIndex].comment,
              skipMultilineEncoding:
                change.skipMultilineEncoding !== undefined
                  ? change.skipMultilineEncoding
                  : mergedSecrets[updateIndex].skipMultilineEncoding,
              secretMetadata: change.secretMetadata || mergedSecrets[updateIndex].secretMetadata,
              isPending: true,
              pendingAction: PendingAction.Update,
              tags: change.tags
                ? change.tags?.map((tag) => ({
                    id: tag.id,
                    slug: tag.slug,
                    projectId,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    __v: 0
                  })) || []
                : mergedSecrets[updateIndex].tags,
              originalKey: mergedSecrets[updateIndex].key
            };
          }
          break;

        case PendingAction.Delete:
          const deleteIndex = mergedSecrets.findIndex((s) => s.key === change.secretKey);
          if (deleteIndex >= 0) {
            mergedSecrets[deleteIndex] = {
              ...mergedSecrets[deleteIndex],
              isPending: true,
              pendingAction: PendingAction.Delete
            };
          }
          break;

        default:
          break;
      }
    });

    return mergedSecrets;
  };

  const getMergedFoldersWithPending = () => {
    if (!isBatchMode || pendingChanges.folders.length === 0) {
      return folders;
    }

    const mergedFolders = [...(folders || [])];

    pendingChanges.folders.forEach((change) => {
      switch (change.type) {
        case PendingAction.Create:
          mergedFolders.unshift({
            id: change.id,
            name: change.folderName,
            description: change.description,
            parentId: null,
            isPending: true,
            pendingAction: PendingAction.Create
          } as any);
          break;

        case PendingAction.Update:
          const updateIndex = mergedFolders.findIndex((f) => f.id === change.id);
          if (updateIndex >= 0) {
            mergedFolders[updateIndex] = {
              ...mergedFolders[updateIndex],
              name: change.folderName,
              description:
                change.description !== undefined
                  ? change.description
                  : mergedFolders[updateIndex].description,
              isPending: true,
              pendingAction: PendingAction.Update
            };
          }
          break;

        case PendingAction.Delete:
          const deleteIndex = mergedFolders.findIndex((f) => f.id === change.id);
          if (deleteIndex >= 0) {
            mergedFolders[deleteIndex] = {
              ...mergedFolders[deleteIndex],
              isPending: true,
              pendingAction: PendingAction.Delete
            };
          }
          break;

        default:
          break;
      }
    });

    return mergedFolders;
  };

  const mergedSecrets = getMergedSecretsWithPending();
  const mergedFolders = getMergedFoldersWithPending();

  if (!(currentProject?.version === ProjectVersion.V3))
    return (
      <div className="flex h-full w-full flex-col items-center justify-center px-6 text-mineshaft-50 dark:scheme-dark">
        <SecretV2MigrationSection />
      </div>
    );

  return (
    <div className="mx-auto flex max-w-8xl flex-col text-mineshaft-50 dark:scheme-dark">
      <Link
        to="/organizations/$orgId/projects/secret-management/$projectId/overview"
        params={{
          orgId: currentOrg.id,
          projectId
        }}
        className="mb-4 flex items-center gap-x-2 text-sm text-mineshaft-400"
      >
        <FontAwesomeIcon icon={faChevronLeft} />
        Secrets Overview
      </Link>
      <PageHeader
        scope={ProjectType.SecretManager}
        title="Secrets Management"
        description={
          <p className="text-md text-bunker-300">
            Inject your secrets using
            <a
              className="ml-1 text-mineshaft-300 underline decoration-primary-800 underline-offset-4 duration-200 hover:text-mineshaft-100 hover:decoration-primary-600"
              href="https://infisical.com/docs/cli/overview"
              target="_blank"
              rel="noopener noreferrer"
            >
              Infisical CLI
            </a>
            ,
            <a
              className="ml-1 text-mineshaft-300 underline decoration-primary-800 underline-offset-4 duration-200 hover:text-mineshaft-100 hover:decoration-primary-600"
              href="https://infisical.com/docs/documentation/getting-started/api"
              target="_blank"
              rel="noopener noreferrer"
            >
              Infisical API
            </a>
            ,
            <a
              className="ml-1 text-mineshaft-300 underline decoration-primary-800 underline-offset-4 duration-200 hover:text-mineshaft-100 hover:decoration-primary-600"
              href="https://infisical.com/docs/sdks/overview"
              target="_blank"
              rel="noopener noreferrer"
            >
              Infisical SDKs
            </a>
            , and
            <a
              className="ml-1 text-mineshaft-300 underline decoration-primary-800 underline-offset-4 duration-200 hover:text-mineshaft-100 hover:decoration-primary-600"
              href="https://infisical.com/docs/documentation/getting-started/introduction"
              target="_blank"
              rel="noopener noreferrer"
            >
              more
            </a>
            .
          </p>
        }
      />
      <SecretV2MigrationSection />
      <FolderBreadCrumbs secretPath={secretPath} />
      <EnvironmentTabs secretPath={secretPath} />
      {!isRollbackMode ? (
        <>
          <ActionBar
            environment={environment}
            secretPath={secretPath}
            isVisible={isVisible}
            isBatchMode={isBatchMode}
            filter={filter}
            tags={tags}
            onVisibilityToggle={handleToggleVisibility}
            onSearchChange={handleSearchChange}
            onToggleTagFilter={handleTagToggle}
            snapshotCount={changesCount || 0}
            isSnapshotCountLoading={isChangesCountPending && isChangesCountFetching}
            onToggleRowType={handleToggleRowType}
            onClickRollbackMode={handleOnClickRollbackMode}
            protectedBranchPolicyName={boardPolicy?.name}
            importedBy={importedBy}
            usedBySecretSyncs={usedBySecretSyncs}
            isPITEnabled={isPITEnabled}
            hasPathPolicies={hasPathPolicies}
            onRequestAccess={(params) => handlePopUpOpen("requestAccess", params)}
            onClearFilters={handleClearFilters}
          />
          <div
            ref={tableRef}
            className={twMerge(
              "mt-3 thin-scrollbar overflow-x-hidden overflow-y-auto rounded-md bg-mineshaft-800 text-left text-sm text-bunker-300",
              isNotEmpty && "rounded-b-none"
            )}
          >
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
                  <div className="relative">
                    <div
                      tabIndex={-1}
                      role="button"
                      className={`absolute -right-[0.05rem] z-40 h-full w-0.5 cursor-ew-resize hover:bg-blue-400/20 ${
                        isResizing ? "bg-blue-400/75" : "bg-transparent"
                      }`}
                      onMouseDown={handleMouseDown}
                    />
                    <div className="pointer-events-none absolute top-2 -right-[0.04rem] z-30">
                      <div className="h-5 w-0.5 rounded-[1.5px] bg-gray-400 opacity-50" />
                    </div>
                    <div
                      className="flex shrink-0 items-center border-r border-mineshaft-600 py-2 pl-4"
                      style={{ width: colWidth }}
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
                  </div>
                  <div className="grow px-4 py-2">Value</div>
                </div>
              )}
              {hasPathPolicies &&
                // eslint-disable-next-line no-nested-ternary
                (!canReadSecret ? (
                  <div
                    className={twMerge(
                      "flex border-l-2 border-l-primary bg-mineshaft-700 px-4 py-2",
                      isNotEmpty ? "border-b border-b-mineshaft-600" : ""
                    )}
                  >
                    <div className="flex items-center text-sm">
                      <FontAwesomeIcon
                        icon={faInfoCircle}
                        className="mr-[1.65rem] ml-[0.15rem] text-primary"
                      />
                      <span>You do not have permission to read secrets in this folder</span>
                    </div>
                    <Button
                      variant="outline_bg"
                      size="xs"
                      className="ml-auto"
                      onClick={() =>
                        handlePopUpOpen("requestAccess", [ProjectPermissionActions.Read])
                      }
                    >
                      Request Access
                    </Button>
                  </div>
                ) : !canEditSecrets || !canDeleteSecrets ? (
                  <div className="flex border-b border-l-2 border-b-mineshaft-600 border-l-primary bg-mineshaft-700 px-4 py-2">
                    <div className="flex items-center text-sm">
                      <FontAwesomeIcon
                        icon={faInfoCircle}
                        className="mr-[1.65rem] ml-[0.15rem] text-primary"
                      />
                      <span>
                        You do not have permission to {!canEditSecrets ? "edit" : ""}
                        {!canEditSecrets && !canDeleteSecrets ? " or " : ""}
                        {!canDeleteSecrets ? "delete" : ""} secrets in this folder
                      </span>
                    </div>
                    <Button
                      variant="outline_bg"
                      size="xs"
                      className="ml-auto"
                      onClick={() =>
                        handlePopUpOpen("requestAccess", [
                          ...(!canEditSecrets ? [ProjectPermissionActions.Edit] : []),
                          ...(!canDeleteSecrets ? [ProjectPermissionActions.Delete] : [])
                        ])
                      }
                    >
                      Request Access
                    </Button>
                  </div>
                ) : null)}

              {canReadSecretImports && Boolean(imports?.length) && (
                <SecretImportListView
                  searchTerm={debouncedSearchFilter}
                  secretImports={imports}
                  isFetching={isDetailsFetching}
                  environment={environment}
                  projectId={projectId}
                  secretPath={secretPath}
                  importedSecrets={importedSecrets}
                />
              )}
              {Boolean(mergedFolders?.length) && (
                <FolderListView
                  folders={mergedFolders}
                  environment={environment}
                  projectId={projectId}
                  secretPath={secretPath}
                  onNavigateToFolder={handleResetFilter}
                  canNavigate={isFetched}
                />
              )}
              {canReadDynamicSecret && Boolean(dynamicSecrets?.length) && (
                <DynamicSecretListView
                  selectedDynamicSecretId={selectedDynamicSecretId}
                  environment={environment}
                  projectSlug={projectSlug}
                  secretPath={secretPath}
                  dynamicSecrets={dynamicSecrets}
                />
              )}
              {canReadSecretRotations && Boolean(secretRotations?.length) && (
                <SecretRotationListView
                  secretRotations={secretRotations}
                  colWidth={colWidth}
                  tags={tags}
                  projectId={projectId}
                  secretPath={secretPath}
                  isProtectedBranch={isProtectedBranch}
                  importedBy={importedBy}
                  usedBySecretSyncs={usedBySecretSyncs}
                  getMergedSecretsWithPending={getMergedSecretsWithPending}
                />
              )}
              {canReadSecret && Boolean(mergedSecrets?.length) && (
                <SecretListView
                  colWidth={colWidth}
                  secrets={mergedSecrets}
                  tags={tags}
                  isVisible={isVisible}
                  environment={environment}
                  projectId={projectId}
                  secretPath={secretPath}
                  isProtectedBranch={isProtectedBranch}
                  importedBy={importedBy}
                  usedBySecretSyncs={usedBySecretSyncs}
                />
              )}
              {(pendingChanges.secrets.length > 0 || pendingChanges.folders.length > 0) && (
                <CommitForm
                  onCommit={handleCreateCommit}
                  environment={environment}
                  projectId={projectId}
                  secretPath={secretPath}
                  isCommitting={isCommitPending}
                />
              )}
              {noAccessSecretCount > 0 && <SecretNoAccessListView count={noAccessSecretCount} />}
            </div>
          </div>
          {!canReadSecret &&
            !canReadDynamicSecret &&
            !canReadSecretImports &&
            folders?.length === 0 && <PermissionDeniedBanner />}
          {!isDetailsLoading &&
            (totalCount > 0 ||
              pendingChanges.secrets.length > 0 ||
              pendingChanges.folders.length > 0) && (
              <Pagination
                startAdornment={
                  <SecretTableResourceCount
                    dynamicSecretCount={totalDynamicSecretCount}
                    importCount={totalImportCount}
                    secretCount={
                      totalSecretCount +
                      pendingChanges.secrets.filter((s) => s.type === PendingAction.Create).length
                    }
                    folderCount={
                      totalFolderCount +
                      pendingChanges.folders.filter((f) => f.type === PendingAction.Create).length
                    }
                    secretRotationCount={totalSecretRotationCount}
                  />
                }
                className="rounded-b-md border-t border-solid border-t-mineshaft-600"
                count={totalCount + pendingChanges.secrets.length + pendingChanges.folders.length}
                page={page}
                perPage={perPage}
                onChangePage={(newPage) => setPage(newPage)}
                onChangePerPage={handlePerPageChange}
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
                projectId={projectId}
                secretPath={secretPath}
                autoCapitalize={currentProject?.autoCapitalization}
                isProtectedBranch={isProtectedBranch}
                isBatchMode={isBatchMode}
              />
            </ModalContent>
          </Modal>
          {!!pathPolicies && (
            <RequestAccessModal
              policies={pathPolicies}
              isOpen={popUp.requestAccess.isOpen}
              onOpenChange={() => {
                handlePopUpClose("requestAccess");
              }}
              selectedActions={popUp.requestAccess.data}
              secretPath={pathPolicies?.[0]?.secretPath}
            />
          )}
          <SecretDropzone
            environment={environment}
            projectId={projectId}
            secretPath={secretPath}
            isSmaller={isNotEmpty}
            environments={currentProject?.environments}
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
          projectId={projectId}
          secretPath={secretPath}
          secrets={secrets}
          folders={folders}
          snapshotCount={changesCount}
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
