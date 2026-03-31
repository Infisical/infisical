import { SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { subject } from "@casl/ability";
import { DragDropProvider, DragEndEvent, DragOverlay } from "@dnd-kit/react";
import { isSortable } from "@dnd-kit/react/sortable";
import { arrayMove } from "@dnd-kit/sortable";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useRouter, useSearch } from "@tanstack/react-router";
import { AxiosError } from "axios";
import {
  ChevronDownIcon,
  CopyIcon,
  DownloadIcon,
  EyeIcon,
  EyeOffIcon,
  GitCommitIcon,
  GroupIcon,
  InfoIcon,
  LayersIcon,
  LockIcon,
  SettingsIcon,
  TrashIcon
} from "lucide-react";
import { twMerge } from "tailwind-merge";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { CreateSecretRotationV2Modal } from "@app/components/secret-rotations-v2";
import { DeleteSecretRotationV2Modal } from "@app/components/secret-rotations-v2/DeleteSecretRotationV2Modal";
import { EditSecretRotationV2Modal } from "@app/components/secret-rotations-v2/EditSecretRotationV2Modal";
import { ReconcileLocalAccountRotationModal } from "@app/components/secret-rotations-v2/ReconcileLocalAccountRotationModal";
import { RotateSecretRotationV2Modal } from "@app/components/secret-rotations-v2/RotateSecretRotationV2Modal";
import { ViewSecretRotationV2GeneratedCredentialsModal } from "@app/components/secret-rotations-v2/ViewSecretRotationV2GeneratedCredentials";
import {
  Button as ButtonV2,
  DeleteActionModal,
  Modal,
  ModalContent,
  PageHeader
} from "@app/components/v2";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  Badge,
  Button,
  Checkbox,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  UnstableAlert,
  UnstableAlertTitle,
  UnstableCard,
  UnstableCardContent,
  UnstableCardHeader,
  UnstableDropdownMenu,
  UnstableDropdownMenuContent,
  UnstableDropdownMenuItem,
  UnstableDropdownMenuTrigger,
  UnstablePagination,
  UnstableTable,
  UnstableTableBody,
  UnstableTableCell,
  UnstableTableHead,
  UnstableTableHeader,
  UnstableTableRow
} from "@app/components/v3";
import { apiRequest } from "@app/config/request";
import { ROUTE_PATHS } from "@app/const/routes";
import {
  ProjectPermissionActions,
  ProjectPermissionDynamicSecretActions,
  ProjectPermissionSub,
  useOrgPermission,
  useProject,
  useProjectPermission,
  useSubscription
} from "@app/context";
import {
  ProjectPermissionCommitsActions,
  ProjectPermissionSecretActions,
  ProjectPermissionSecretRotationActions
} from "@app/context/ProjectPermissionContext/types";
import { downloadSecretEnvFile } from "@app/helpers/download";
import { OrgMembershipRole } from "@app/helpers/roles";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import {
  useDebounce,
  useLocalStorageState,
  usePagination,
  usePopUp,
  useResetPageHelper,
  useToggle
} from "@app/hooks";
import {
  useCreateFolder,
  useCreateSecretBatch,
  useCreateSecretV3,
  useDeleteDynamicSecret,
  useDeleteFolder,
  useDeleteSecretImport,
  useDeleteSecretV3,
  useDeleteWsEnvironment,
  useGetImportedSecretsAllEnvs,
  useGetOrCreateFolder,
  useGetSecretApprovalPolicyOfABoard,
  useGetWsTags,
  useUpdateSecretBatch,
  useUpdateSecretImport,
  useUpdateSecretV3
} from "@app/hooks/api";
import {
  dashboardKeys,
  fetchDashboardProjectSecretsByKeys,
  useGetProjectSecretsOverview
} from "@app/hooks/api/dashboard/queries";
import { DashboardSecretsOrderBy, ProjectSecretsImportedBy } from "@app/hooks/api/dashboard/types";
import { TDynamicSecret } from "@app/hooks/api/dynamicSecret/types";
import { useGetFolderCommitsCount } from "@app/hooks/api/folderCommits";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import {
  useGetVaultExternalMigrationConfigs,
  useImportVaultSecrets
} from "@app/hooks/api/migration";
import { VaultImportStatus } from "@app/hooks/api/migration/types";
import { ProjectType, ProjectVersion } from "@app/hooks/api/projects/types";
import { useUpdateFolderBatch } from "@app/hooks/api/secretFolders/queries";
import { PendingAction, TUpdateFolderBatchDTO } from "@app/hooks/api/secretFolders/types";
import { TSecretImport } from "@app/hooks/api/secretImports/types";
import {
  SecretRotation as SecretRotationV2,
  TSecretRotationV2
} from "@app/hooks/api/secretRotationsV2";
import { useCreateCommit } from "@app/hooks/api/secrets/mutations";
import { fetchProjectSecrets, secretKeys } from "@app/hooks/api/secrets/queries";
import {
  ApiErrorTypes,
  ProjectEnv,
  SecretType,
  SecretV3RawSanitized,
  TApiErrors,
  TSecretFolder,
  WsTag
} from "@app/hooks/api/types";
import { useNavigationBlocker } from "@app/hooks/useNavigationBlocker";
import { usePathAccessPolicies } from "@app/hooks/usePathAccessPolicies";
import {
  useDynamicSecretOverview,
  useFolderOverview,
  useSecretImportOverview,
  useSecretOverview,
  useSecretRotationOverview
} from "@app/hooks/utils";
import { RequestAccessModal } from "@app/pages/secret-manager/SecretApprovalsPage/components/AccessApprovalRequest/components/RequestAccessModal";

import { CreateDynamicSecretForm } from "../SecretDashboardPage/components/ActionBar/CreateDynamicSecretForm";
import { CreateSecretImportForm } from "../SecretDashboardPage/components/ActionBar/CreateSecretImportForm";
import { FolderForm } from "../SecretDashboardPage/components/ActionBar/FolderForm";
import { ReplicateFolderFromBoard } from "../SecretDashboardPage/components/ActionBar/ReplicateFolderFromBoard/ReplicateFolderFromBoard";
import { VaultSecretImportModal } from "../SecretDashboardPage/components/ActionBar/VaultSecretImportModal";
import { CommitForm } from "../SecretDashboardPage/components/CommitForm";
import { CreateDynamicSecretLease } from "../SecretDashboardPage/components/DynamicSecretListView/CreateDynamicSecretLease";
import { DynamicSecretLease } from "../SecretDashboardPage/components/DynamicSecretListView/DynamicSecretLease";
import { EditDynamicSecretForm } from "../SecretDashboardPage/components/DynamicSecretListView/EditDynamicSecretForm";
import {
  HIDDEN_SECRET_VALUE,
  HIDDEN_SECRET_VALUE_API_MASK
} from "../SecretDashboardPage/components/SecretListView/SecretItem";
import {
  PendingChanges,
  PendingFolderUpdate,
  StoreProvider,
  useBatchMode,
  useBatchModeActions
} from "../SecretDashboardPage/SecretMainPage.store";
import { AddResourceButtons } from "./components/AddResourceButtons/AddResourceButtons";
import { CreateSecretForm } from "./components/CreateSecretForm";
import { ImportSecretsModal, SecretDropzone } from "./components/SecretDropzone";
import { SecretV2MigrationSection } from "./components/SecretV2MigrationSection";
import { SelectionPanel } from "./components/SelectionPanel/SelectionPanel";
import {
  DownloadEnvButton,
  DynamicSecretTableRow,
  EmptyResourceDisplay,
  EnvironmentSelect,
  FolderBreadcrumb,
  FolderTableRow,
  ResourceCount,
  ResourceFilter,
  ResourceSearchInput,
  SecretImportTableRow,
  SecretNoAccessTableRow,
  SecretRotationTableRow,
  SecretTableRow
} from "./components";

type TParsedEnv = { value: string; comments: string[]; secretPath?: string; secretKey: string }[];
type TParsedFolderEnv = Record<
  string,
  Record<string, { value: string; comments: string[]; secretPath?: string }>
>;
type TSecOverwriteOpt = { update: TParsedEnv; create: TParsedEnv };

export enum EntryType {
  FOLDER = "folder",
  SECRET = "secret"
}

export enum RowType {
  Folder = "folder",
  DynamicSecret = "dynamic",
  Secret = "secret",
  SecretRotation = "rotation",
  SecretImport = "import"
}

type Filter = {
  [key in RowType]: boolean;
};

const DEFAULT_FILTER_STATE = {
  [RowType.Folder]: false,
  [RowType.DynamicSecret]: false,
  [RowType.Secret]: false,
  [RowType.SecretRotation]: false,
  [RowType.SecretImport]: false
};

// const DEFAULT_COLLAPSED_HEADER_HEIGHT = 120;

const OVERVIEW_BATCH_MODE_KEY = "overview-batch-mode-enabled";

const OverviewPageContent = () => {
  const { t } = useTranslation();

  const router = useRouter();
  const navigate = useNavigate({
    from: ROUTE_PATHS.SecretManager.OverviewPage.path
  });
  const routerSearch = useSearch({
    from: ROUTE_PATHS.SecretManager.OverviewPage.id,
    select: (el) => ({
      secretPath: el.secretPath,
      search: el.search,
      environments: el.environments,
      dynamicSecretId: el.dynamicSecretId,
      filterBy: el.filterBy
    })
  });

  const orgId = useParams({
    from: ROUTE_PATHS.SecretManager.OverviewPage.id,
    select: (el) => el.orgId
  });
  const { permission } = useProjectPermission();
  const tableRef = useRef<HTMLDivElement>(null);
  const { currentProject, projectId } = useProject();
  const isProjectV3 = currentProject?.version === ProjectVersion.V3;
  const projectSlug = currentProject?.slug as string;
  const [searchFilter, setSearchFilter] = useState("");
  const [debouncedSearchFilter, setDebouncedSearchFilter] = useDebounce(searchFilter);
  const secretPath = (routerSearch?.secretPath as string) || "/";
  const { subscription } = useSubscription();
  const { hasOrgRole } = useOrgPermission();
  const isOrgAdmin = hasOrgRole(OrgMembershipRole.Admin);
  const { data: vaultConfigs = [] } = useGetVaultExternalMigrationConfigs();
  const hasVaultConnection = vaultConfigs.some((config) => config.connectionId);
  const { mutateAsync: importVaultSecrets } = useImportVaultSecrets();
  const prevPageSize = useRef(0);

  const canReadCommits = permission.can(
    ProjectPermissionCommitsActions.Read,
    ProjectPermissionSub.Commits
  );

  const [isSingleEnvSecretsVisible, setIsSingleEnvSecretsVisible] = useToggle();

  // scott: keeping incase we bring it back
  // const [collapseEnvironments, setCollapseEnvironments] = useToggle(
  //   Boolean(localStorage.getItem("overview-collapse-environments"))
  // );
  // const handleToggleNarrowHeader = () => {
  //   setCollapseEnvironments.toggle();
  //   if (collapseEnvironments) {
  //     localStorage.removeItem("overview-collapse-environments");
  //   } else {
  //     localStorage.setItem("overview-collapse-environments", "true");
  //   }
  // };

  const [filter, setFilter] = useState<Filter>(DEFAULT_FILTER_STATE);
  const [filterHistory, setFilterHistory] = useState<
    Map<string, { filter: Filter; searchFilter: string }>
  >(new Map());

  const [selectedEntries, setSelectedEntries] = useState<{
    // selectedEntries[name/key][envSlug][resource]
    [EntryType.FOLDER]: Record<string, Record<string, TSecretFolder>>;
    [EntryType.SECRET]: Record<string, Record<string, SecretV3RawSanitized>>;
  }>({
    [EntryType.FOLDER]: {},
    [EntryType.SECRET]: {}
  });

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
    initPerPage: getUserTablePreference("secretOverviewTable", PreferenceKey.PerPage, 100)
  });

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference("secretOverviewTable", PreferenceKey.PerPage, newPerPage);
  };

  const resetSelectedEntries = useCallback(() => {
    setSelectedEntries({
      [EntryType.FOLDER]: {},
      [EntryType.SECRET]: {}
    });
  }, []);

  useEffect(() => {
    const onRouteChangeStart = () => {
      resetSelectedEntries();
    };

    const unsubscribeRouterEvent = router.subscribe("onLoad", onRouteChangeStart);

    return () => {
      unsubscribeRouterEvent();
    };
  }, []);

  const userAvailableEnvs = currentProject?.environments || [];
  const userAvailableDynamicSecretEnvs = userAvailableEnvs.filter((env) =>
    permission.can(
      ProjectPermissionDynamicSecretActions.CreateRootCredential,
      subject(ProjectPermissionSub.DynamicSecrets, {
        environment: env.slug,
        secretPath,
        metadata: ["*"]
      })
    )
  );
  const userAvailableSecretRotationEnvs = userAvailableEnvs.filter((env) =>
    permission.can(
      ProjectPermissionSecretRotationActions.Create,
      subject(ProjectPermissionSub.SecretRotation, {
        environment: env.slug,
        secretPath
      })
    )
  );
  const userAvailableSecretImportEnvs = userAvailableEnvs.filter((env) =>
    permission.can(
      ProjectPermissionActions.Create,
      subject(ProjectPermissionSub.SecretImports, {
        environment: env.slug,
        secretPath
      })
    )
  );

  const [storedEnvIds, setStoredEnvIds] = useLocalStorageState<string[]>(
    `overview-selected-envs-${projectId}`,
    userAvailableEnvs?.[0]?.id ? [userAvailableEnvs[0].id] : []
  );

  useEffect(() => {
    const envSlugs = routerSearch.environments;
    if (envSlugs && envSlugs.length > 0) {
      const envIds = userAvailableEnvs
        .filter((env) => envSlugs.includes(env.slug))
        .map((env) => env.id);
      if (envIds.length > 0) {
        setStoredEnvIds(envIds);
      }
    }
  }, []);

  const filteredEnvs = useMemo(() => {
    if (!storedEnvIds.length) return [];
    return userAvailableEnvs.filter((env) => storedEnvIds.includes(env.id));
  }, [storedEnvIds, userAvailableEnvs]);

  const setFilteredEnvs = useCallback(
    (value: SetStateAction<ProjectEnv[]>) => {
      setStoredEnvIds((prev) => {
        const prevEnvs = userAvailableEnvs.filter((env) => prev.includes(env.id));
        const next = typeof value === "function" ? value(prevEnvs) : value;
        return next.map((env) => env.id);
      });
    },
    [setStoredEnvIds, userAvailableEnvs]
  );

  const visibleEnvs = filteredEnvs.length ? filteredEnvs : userAvailableEnvs;
  const singleVisibleEnv = visibleEnvs.length === 1 ? visibleEnvs[0] : null;

  const {
    data: { count: singleEnvCommitCount, folderId: singleEnvFolderId } = {
      count: 0,
      folderId: ""
    },
    isPending: isSingleEnvCommitCountPending,
    isFetching: isSingleEnvCommitCountFetching
  } = useGetFolderCommitsCount({
    directory: secretPath,
    projectId,
    environment: singleVisibleEnv?.slug ?? "",
    isPaused: !singleVisibleEnv || !canReadCommits
  });

  const { data: boardPolicy } = useGetSecretApprovalPolicyOfABoard({
    projectId,
    environment: singleVisibleEnv?.slug ?? "",
    secretPath,
    options: { enabled: Boolean(singleVisibleEnv) }
  });
  const isProtectedBranch = Boolean(boardPolicy);

  const isSingleEnvView = visibleEnvs.length === 1;
  const singleEnvSlug = isSingleEnvView ? visibleEnvs[0].slug : "";
  const { pathPolicies, hasPathPolicies } = usePathAccessPolicies({
    secretPath,
    environment: singleEnvSlug
  });

  useEffect(() => {
    setIsSingleEnvSecretsVisible.off();
  }, [singleVisibleEnv?.slug]);

  const secretSubject = subject(ProjectPermissionSub.Secrets, {
    environment: singleEnvSlug,
    secretPath,
    secretName: "*",
    secretTags: ["*"]
  });

  const canReadSecrets = singleVisibleEnv
    ? permission.can(ProjectPermissionSecretActions.DescribeSecret, secretSubject)
    : true;

  const canEditSecrets = singleVisibleEnv
    ? permission.can(ProjectPermissionSecretActions.Edit, secretSubject)
    : true;

  const canDeleteSecrets = singleVisibleEnv
    ? permission.can(ProjectPermissionSecretActions.Delete, secretSubject)
    : true;

  const canCreateSecrets = singleVisibleEnv
    ? permission.can(ProjectPermissionSecretActions.Create, secretSubject)
    : true;

  const singleEnvChangesCount = subscription.pitRecovery ? singleEnvCommitCount : 0;
  const isSingleEnvChangesCountLoading = subscription.pitRecovery
    ? isSingleEnvCommitCountPending && isSingleEnvCommitCountFetching
    : false;

  const { secretImports, isImportedSecretPresentInEnv, getImportedSecretByKey } =
    useGetImportedSecretsAllEnvs({
      projectId,
      path: secretPath,
      environments: (userAvailableEnvs || []).map(({ slug }) => slug)
    });

  const importedSecretsFlat = useMemo(
    () =>
      secretImports?.flatMap(({ data }, index) =>
        (data ?? []).map((item) => ({
          environment: item.environment,
          secretPath: item.secretPath,
          sourceEnv: userAvailableEnvs[index].slug,
          secrets: item.secrets
        }))
      ) ?? [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [(secretImports || []).map((response) => response.data)]
  );

  const isFilteredByResources = Object.values(filter).some(Boolean);
  const {
    isPending: isOverviewLoading,
    data: overview,
    isPlaceholderData,
    isFetching: isOverviewFetching
  } = useGetProjectSecretsOverview(
    {
      projectId,
      environments: visibleEnvs.map((env) => env.slug),
      secretPath,
      orderDirection,
      orderBy,
      includeFolders: isFilteredByResources ? filter.folder : true,
      includeDynamicSecrets: isFilteredByResources ? filter.dynamic : true,
      includeSecrets: isFilteredByResources ? filter.secret : true,
      includeImports: isFilteredByResources ? (filter[RowType.SecretImport] ?? true) : true,
      includeSecretRotations: isFilteredByResources ? filter.rotation : true,
      search: debouncedSearchFilter,
      limit,
      offset
    },
    { enabled: isProjectV3 }
  );

  const {
    secrets,
    folders,
    dynamicSecrets,
    secretRotations,
    totalFolderCount,
    totalSecretCount,
    totalDynamicSecretCount,
    totalSecretRotationCount,
    totalImportCount,
    totalCount = 0,
    totalUniqueFoldersInPage,
    totalUniqueSecretsInPage,
    totalUniqueSecretImportsInPage,
    totalUniqueDynamicSecretsInPage,
    totalUniqueSecretRotationsInPage,
    importedByEnvs,
    usedBySecretSyncs
  } = overview ?? {};

  const secretImportsShaped = secretImports
    ?.flatMap(({ data }) => data)
    .filter(Boolean)
    .flatMap((item) => item?.secrets || []);

  const handleIsImportedSecretPresentInEnv = (envSlug: string, secretName: string) => {
    if (secrets?.some((s) => s.key === secretName && s.env === envSlug)) {
      return false;
    }
    if (secretImportsShaped.some((s) => s.key === secretName && s.sourceEnv === envSlug)) {
      return true;
    }
    return isImportedSecretPresentInEnv(envSlug, secretName);
  };

  useResetPageHelper({
    totalCount,
    offset,
    setPage
  });

  const { folderNamesAndDescriptions, getFolderByNameAndEnv, isFolderPresentInEnv } =
    useFolderOverview(folders);

  const {
    dynamicSecretNames,
    isDynamicSecretPresentInEnv,
    getDynamicSecretByName,
    getDynamicSecretStatusesByName
  } = useDynamicSecretOverview(dynamicSecrets);

  const {
    secretRotationNames,
    isSecretRotationPresentInEnv,
    getSecretRotationByName,
    getSecretRotationStatusesByName
  } = useSecretRotationOverview(secretRotations);

  const { secretImportNames, isSecretImportInEnv, getSecretImportByEnv, getSecretImportsForEnv } =
    useSecretImportOverview(overview?.imports);

  const { secKeys } = useSecretOverview(secrets || []);

  const getSecretByKey = useCallback(
    (env: string, key: string) => {
      const sec = secrets?.find((s) => s.env === env && s.key === key);
      return sec;
    },
    [secrets]
  );

  const { data: tags } = useGetWsTags(
    permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.Tags) ? projectId : ""
  );

  const queryClient = useQueryClient();
  const { mutateAsync: createSecretV3 } = useCreateSecretV3();
  const { mutateAsync: updateSecretV3 } = useUpdateSecretV3();
  const { mutateAsync: deleteSecretV3 } = useDeleteSecretV3();
  const { mutateAsync: createSecretBatch, isPending: isCreatingSecrets } = useCreateSecretBatch();
  const { mutateAsync: updateSecretBatch, isPending: isUpdatingSecrets } = useUpdateSecretBatch();
  const { mutateAsync: createFolder } = useCreateFolder();
  const { mutateAsync: deleteFolder } = useDeleteFolder();
  const { mutateAsync: getOrCreateFolder } = useGetOrCreateFolder();
  const { mutateAsync: updateFolderBatch } = useUpdateFolderBatch();
  const deleteDynamicSecret = useDeleteDynamicSecret();
  const { mutateAsync: deleteSecretImport } = useDeleteSecretImport();
  const { mutate: updateSecretImport } = useUpdateSecretImport();
  const { mutateAsync: deleteWsEnvironment } = useDeleteWsEnvironment();

  // Batch mode state and hooks
  const [isOverviewBatchMode, setIsOverviewBatchMode] = useState(
    () => localStorage.getItem(OVERVIEW_BATCH_MODE_KEY) === "true"
  );
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const { pendingChanges } = useBatchMode();
  const {
    addPendingChange,
    loadPendingChanges,
    clearAllPendingChanges,
    setExistingKeys,
    removePendingChange
  } = useBatchModeActions();
  const { mutateAsync: createCommit, isPending: isCommitPending } = useCreateCommit();

  const isBatchModeActive = isOverviewBatchMode && isSingleEnvView;
  const hasPendingBatchChanges =
    isBatchModeActive && (pendingChanges.secrets.length > 0 || pendingChanges.folders.length > 0);

  useEffect(() => {
    if (hasPendingBatchChanges) {
      resetSelectedEntries();
    }
  }, [hasPendingBatchChanges, resetSelectedEntries]);

  const storedEnvIdsKey = storedEnvIds.join(",");
  const prevStoredEnvIdsKeyRef = useRef(storedEnvIdsKey);
  useEffect(() => {
    if (prevStoredEnvIdsKeyRef.current !== storedEnvIdsKey) {
      prevStoredEnvIdsKeyRef.current = storedEnvIdsKey;
      resetSelectedEntries();
    }
  }, [storedEnvIdsKey, resetSelectedEntries]);

  useNavigationBlocker({
    shouldBlock:
      isBatchModeActive && (pendingChanges.secrets.length > 0 || pendingChanges.folders.length > 0),
    message:
      "You have unsaved changes. If you leave now, your work will be lost. Do you want to continue?",
    context: {
      projectId,
      environment: singleVisibleEnv?.slug ?? "",
      secretPath
    }
  });

  useEffect(() => {
    if (isBatchModeActive && singleVisibleEnv) {
      loadPendingChanges({
        projectId,
        environment: singleVisibleEnv.slug,
        secretPath
      });
    }
  }, [isBatchModeActive, singleVisibleEnv?.slug, secretPath, projectId, loadPendingChanges]);

  useEffect(() => {
    if (isBatchModeActive) {
      setExistingKeys(
        secKeys,
        folderNamesAndDescriptions.map((f) => f.name)
      );
    }
  }, [isBatchModeActive, secKeys, folderNamesAndDescriptions, setExistingKeys]);

  const singleEnvImports = useMemo(
    () => (isSingleEnvView ? getSecretImportsForEnv(singleEnvSlug) : []),
    [isSingleEnvView, singleEnvSlug, getSecretImportsForEnv]
  );
  const [sortableImportItems, setSortableImportItems] = useState<TSecretImport[]>([]);

  useEffect(() => {
    if (!isOverviewFetching) {
      setSortableImportItems(singleEnvImports);
    }
  }, [isOverviewFetching, singleEnvImports]);

  const [importParsedSecrets, setImportParsedSecrets] = useState<Record<
    string,
    { value: string; comments: string[] }
  > | null>(null);

  const { handlePopUpOpen, handlePopUpToggle, handlePopUpClose, popUp } = usePopUp([
    "addSecretsInAllEnvs",
    "addFolder",
    "misc",
    "updateFolder",
    "deleteFolder",
    "addDynamicSecret",
    "addSecretRotation",
    "editSecretRotation",
    "rotateSecretRotation",
    "viewSecretRotationGeneratedCredentials",
    "deleteSecretRotation",
    "upgradePlan",
    "reconcileSecretRotation",
    "importSecrets",
    "editDynamicSecret",
    "dynamicSecretLeases",
    "createDynamicSecretLease",
    "deleteDynamicSecret",
    "snapshots",
    "replicateFolder",
    "confirmReplicateUpload",
    "deleteSecretImport",
    "addSecretImport",
    "deleteEnv",
    "requestAccess",
    "importFromVault",
    "confirmDisableBatchMode"
  ] as const);

  // Auto-open dynamic secret leases modal when linked via notification/email
  useEffect(() => {
    if (routerSearch.dynamicSecretId && dynamicSecrets?.length) {
      const match = dynamicSecrets.find((ds) => ds.id === routerSearch.dynamicSecretId);
      if (match) {
        handlePopUpOpen("dynamicSecretLeases", match);
        navigate({ search: (prev) => ({ ...prev, dynamicSecretId: undefined }), replace: true });
      }
    }
  }, [routerSearch.dynamicSecretId, dynamicSecrets?.map((ds) => ds.id).join(",")]);

  // Apply search and/or resource type filter when linked via notification/email
  useEffect(() => {
    if (routerSearch.search || routerSearch.filterBy) {
      const { search, filterBy, ...query } = routerSearch;
      // temp workaround until we transition state to query params
      navigate({ search: query, replace: true });

      const initialFilter = { ...DEFAULT_FILTER_STATE };
      if (filterBy) {
        const rowType = Object.values(RowType).find((rt) => rt === filterBy);
        if (rowType) {
          initialFilter[rowType] = true;
        }
      }
      setFilter(initialFilter);

      if (search) {
        setSearchFilter(search as string);
        setDebouncedSearchFilter(search as string);
      }
    }
  }, [routerSearch.search, routerSearch.filterBy]);

  const handleViewCommitHistory = async (envSlug: string, preloadedFolderId?: string) => {
    if (!subscription?.pitRecovery) {
      handlePopUpOpen("upgradePlan", {
        text: "You can use point-in-time recovery if you upgrade your Infisical plan."
      });
      return;
    }

    if (!canReadCommits) return;

    let targetFolderId = preloadedFolderId;
    if (!targetFolderId) {
      try {
        const res = await apiRequest.get<{ count: number; folderId: string }>(
          "/api/v1/pit/commits/count",
          { params: { environment: envSlug, path: secretPath, projectId } }
        );
        targetFolderId = res.data.folderId;
      } catch {
        createNotification({ type: "error", text: "Failed to load commit history" });
        return;
      }
    }

    navigate({
      to: "/organizations/$orgId/projects/secret-management/$projectId/commits/$environment/$folderId",
      params: { orgId, projectId, folderId: targetFolderId, environment: envSlug },
      search: (query: Record<string, string | string[]>) => ({ ...query, secretPath })
    });
  };

  const handleAddSecretImport = () => {
    handlePopUpOpen("addSecretImport");
  };

  const handleVaultImport = async (vaultPath: string, namespace: string) => {
    const result = await importVaultSecrets({
      projectId,
      environment: singleEnvSlug,
      secretPath,
      vaultNamespace: namespace,
      vaultSecretPath: vaultPath
    });

    if (result.status === VaultImportStatus.ApprovalRequired) {
      createNotification({
        type: "info",
        text: "Secret change request created successfully. Awaiting approval."
      });
    } else {
      createNotification({
        type: "success",
        text: "Successfully imported secrets from HashiCorp Vault"
      });
    }
  };

  const handleFolderCreate = async (folderName: string, description: string | null) => {
    if (isBatchModeActive && singleVisibleEnv) {
      if (isFolderPresentInEnv(folderName, singleVisibleEnv.slug)) {
        createNotification({ type: "info", text: "Folder already exists" });
        handlePopUpClose("addFolder");
        return;
      }
      addPendingChange(
        {
          id: crypto.randomUUID(),
          resourceType: "folder",
          type: PendingAction.Create,
          folderName,
          description: description ?? undefined,
          parentPath: secretPath,
          timestamp: Date.now()
        },
        { projectId, environment: singleVisibleEnv.slug, secretPath }
      );
      handlePopUpClose("addFolder");
      return;
    }

    const promises = visibleEnvs
      .map((env) => {
        const environment = env.slug;
        const isFolderPresent = isFolderPresentInEnv(folderName, environment);
        if (isFolderPresent) {
          return undefined;
        }

        return createFolder({
          name: folderName,
          path: secretPath,
          environment,
          projectId,
          description
        });
      })
      .filter((promise) => promise !== undefined);

    if (promises.length === 0) {
      handlePopUpClose("addFolder");
      createNotification({
        type: "info",
        text: "Folder already exists in all environments"
      });
      return;
    }

    const results = await Promise.allSettled(promises);
    const isFoldersAdded = results.some((result) => result.status === "fulfilled");

    if (isFoldersAdded) {
      handlePopUpClose("addFolder");
      createNotification({
        type: "success",
        text: "Successfully created folder"
      });
    } else {
      createNotification({
        type: "error",
        text: "Failed to create folder"
      });
    }
  };

  // Replicate Secrets Logic
  const replicateCreateCount = (
    (popUp.confirmReplicateUpload?.data as TSecOverwriteOpt)?.create || []
  ).length;
  const replicateUpdateCount = (
    (popUp.confirmReplicateUpload?.data as TSecOverwriteOpt)?.update || []
  ).length;
  const isReplicateNonConflicting = !replicateUpdateCount;
  const isReplicateSubmitting = isCreatingSecrets || isUpdatingSecrets;

  const handleParsedEnvMultiFolder = async (envByPath: TParsedFolderEnv) => {
    if (Object.keys(envByPath).length === 0) {
      createNotification({
        type: "error",
        text: "Failed to find secrets"
      });
      return;
    }

    try {
      const allUpdateSecrets: TParsedEnv = [];
      const allCreateSecrets: TParsedEnv = [];

      await Promise.all(
        Object.entries(envByPath).map(async ([folderPath, boardSecrets]) => {
          let normalizedPath = folderPath;

          if (normalizedPath === "/") {
            normalizedPath = secretPath;
          } else {
            const baseSecretPath = secretPath.endsWith("/") ? secretPath.slice(0, -1) : secretPath;
            const cleanFolderPath = folderPath.startsWith("/")
              ? folderPath.substring(1)
              : folderPath;
            normalizedPath = `${baseSecretPath}/${cleanFolderPath}`;
          }

          const secretFolderKeys = Object.keys(boardSecrets);

          if (secretFolderKeys.length === 0) return;

          const batchSize = 50;
          const secretBatches = Array.from(
            { length: Math.ceil(secretFolderKeys.length / batchSize) },
            (_, i) => secretFolderKeys.slice(i * batchSize, (i + 1) * batchSize)
          );

          const existingSecretLookup = new Set<string>();

          await secretBatches.reduce(async (previous, batch) => {
            await previous;
            try {
              const { secrets: batchSecrets } = await fetchDashboardProjectSecretsByKeys({
                secretPath: normalizedPath,
                environment: singleVisibleEnv!.slug,
                projectId,
                keys: batch
              });

              batchSecrets.forEach((secret) => {
                existingSecretLookup.add(`${normalizedPath}-${secret.secretKey}`);
              });
            } catch (error) {
              if (!(error instanceof AxiosError && error.response?.status === 404)) {
                throw error;
              }
            }
          }, Promise.resolve());

          secretFolderKeys.forEach((secretKey) => {
            const secretData = boardSecrets[secretKey];
            const secretWithPath = {
              ...secretData,
              secretPath: normalizedPath,
              secretKey
            };

            if (existingSecretLookup.has(`${normalizedPath}-${secretKey}`)) {
              allUpdateSecrets.push(secretWithPath);
            } else {
              allCreateSecrets.push(secretWithPath);
            }
          });
        })
      );
      handlePopUpOpen("confirmReplicateUpload", {
        update: allUpdateSecrets,
        create: allCreateSecrets
      });
    } catch (e) {
      console.error(e);
      createNotification({
        text: "Failed to check for secret conflicts",
        type: "error"
      });
      handlePopUpClose("confirmReplicateUpload");
    }
  };

  const handleSaveReplicateImport = async () => {
    const { update, create } = popUp?.confirmReplicateUpload?.data as TSecOverwriteOpt;
    const environment = singleVisibleEnv!.slug;

    const groupedCreateSecrets: Record<
      string,
      Array<{
        type: SecretType;
        secretComment: string;
        secretValue: string;
        secretKey: string;
      }>
    > = {};

    const groupedUpdateSecrets: Record<
      string,
      Array<{
        type: SecretType;
        secretComment: string;
        secretValue: string;
        secretKey: string;
      }>
    > = {};

    const allPaths = new Set<string>();

    create.forEach((secData) => {
      if (secData.secretPath && secData.secretPath !== secretPath) {
        allPaths.add(secData.secretPath);
      }
    });

    const folderPaths = Array.from(allPaths).map((path) => {
      const normalizedPath = path.endsWith("/") ? path.slice(0, -1) : path;
      const segments = normalizedPath.split("/");
      const folderName = segments[segments.length - 1];
      const parentPath = segments.slice(0, -1).join("/");

      return {
        folderName,
        fullPath: normalizedPath,
        parentPath: parentPath || "/"
      };
    });

    folderPaths.sort(
      (a, b) => (a.fullPath.match(/\//g) || []).length - (b.fullPath.match(/\//g) || []).length
    );

    const createdFolders = new Set<string>();

    await folderPaths.reduce(async (previousPromise, { folderName, fullPath, parentPath }) => {
      await previousPromise;

      if (createdFolders.has(fullPath)) return Promise.resolve();

      try {
        await createFolder({
          name: folderName,
          path: parentPath,
          environment,
          projectId
        });

        createdFolders.add(fullPath);
      } catch (err) {
        console.log(`Folder ${folderName} may already exist:`, err);
      }

      return Promise.resolve();
    }, Promise.resolve());

    if (create.length > 0) {
      create.forEach((secData) => {
        const path = secData.secretPath || secretPath;

        if (!groupedCreateSecrets[path]) {
          groupedCreateSecrets[path] = [];
        }

        groupedCreateSecrets[path].push({
          type: SecretType.Shared,
          secretComment: secData.comments.join("\n"),
          secretValue: secData.value,
          secretKey: secData.secretKey
        });
      });

      await Promise.all(
        Object.entries(groupedCreateSecrets).map(([path, batchSecrets]) =>
          createSecretBatch({
            secretPath: path,
            projectId,
            environment,
            secrets: batchSecrets
          })
        )
      );
    }

    if (update.length > 0) {
      update.forEach((secData) => {
        const path = secData.secretPath || secretPath;

        if (!groupedUpdateSecrets[path]) {
          groupedUpdateSecrets[path] = [];
        }

        groupedUpdateSecrets[path].push({
          type: SecretType.Shared,
          secretComment: secData.comments.join("\n"),
          secretValue: secData.value,
          secretKey: secData.secretKey
        });
      });

      await Promise.all(
        Object.entries(groupedUpdateSecrets).map(([path, batchSecrets]) =>
          updateSecretBatch({
            secretPath: path,
            projectId,
            environment,
            secrets: batchSecrets
          })
        )
      );
    }

    queryClient.invalidateQueries({
      queryKey: secretKeys.getProjectSecret({ projectId, environment, secretPath })
    });

    handlePopUpClose("confirmReplicateUpload");
    createNotification({
      type: "success",
      text: "Successfully replicated secrets"
    });
  };

  const handleFolderUpdate = async (newFolderName: string, description: string | null) => {
    if (isBatchModeActive && singleVisibleEnv) {
      const { name: oldFolderName } = popUp.updateFolder.data as TSecretFolder;
      const folder = getFolderByNameAndEnv(oldFolderName, singleVisibleEnv.slug);

      if (!folder) {
        // Folder might be a pending create — find it in pending changes
        const pendingCreate = pendingChanges.folders.find(
          (c) => c.type === PendingAction.Create && c.folderName === oldFolderName
        );
        if (pendingCreate) {
          // Send as an Update so the store merges it into the existing Create
          addPendingChange(
            {
              id: pendingCreate.id,
              resourceType: "folder",
              type: PendingAction.Update,
              originalFolderName: oldFolderName,
              folderName: newFolderName,
              description: description ?? undefined,
              timestamp: Date.now()
            },
            { projectId, environment: singleVisibleEnv.slug, secretPath }
          );
          handlePopUpClose("updateFolder");
          return;
        }

        // Folder might be a pending update (already renamed) — find by displayed name
        const pendingUpdate = pendingChanges.folders.find(
          (c) => c.type === PendingAction.Update && c.folderName === oldFolderName
        ) as PendingFolderUpdate | undefined;
        if (pendingUpdate) {
          addPendingChange(
            {
              id: pendingUpdate.id,
              resourceType: "folder",
              type: PendingAction.Update,
              originalFolderName: pendingUpdate.originalFolderName,
              folderName: newFolderName,
              originalDescription: pendingUpdate.originalDescription,
              description: description ?? undefined,
              timestamp: Date.now()
            },
            { projectId, environment: singleVisibleEnv.slug, secretPath }
          );
          handlePopUpClose("updateFolder");
          return;
        }

        handlePopUpClose("updateFolder");
        return;
      }

      addPendingChange(
        {
          id: folder.id,
          resourceType: "folder",
          type: PendingAction.Update,
          originalFolderName: oldFolderName,
          folderName: newFolderName,
          originalDescription: folder.description,
          description: description ?? undefined,
          timestamp: Date.now()
        },
        { projectId, environment: singleVisibleEnv.slug, secretPath }
      );
      handlePopUpClose("updateFolder");
      return;
    }

    const { name: oldFolderName } = popUp.updateFolder.data as TSecretFolder;

    const updatedFolders: TUpdateFolderBatchDTO["folders"] = [];
    userAvailableEnvs.forEach((env) => {
      if (
        permission.can(
          ProjectPermissionActions.Edit,
          subject(ProjectPermissionSub.SecretFolders, { environment: env.slug, secretPath })
        )
      ) {
        const folder = getFolderByNameAndEnv(oldFolderName, env.slug);
        if (folder) {
          updatedFolders.push({
            environment: env.slug,
            name: newFolderName,
            id: folder.id,
            path: secretPath,
            description
          });
        }
      }
    });

    if (updatedFolders.length === 0) {
      createNotification({
        type: "info",
        text: "You don't have access to rename selected folder"
      });

      handlePopUpClose("updateFolder");
      return;
    }

    try {
      await updateFolderBatch({
        folders: updatedFolders,
        projectId
      });
      createNotification({
        type: "success",
        text: "Successfully renamed folder across environments"
      });
    } catch {
      createNotification({
        type: "error",
        text: "Failed to rename folder across environments"
      });
    } finally {
      handlePopUpClose("updateFolder");
    }
  };

  const handleFolderDelete = async () => {
    const folderName = (popUp.deleteFolder?.data as { name: string })?.name;
    if (!folderName) return;

    if (isBatchModeActive && singleVisibleEnv) {
      const folder = getFolderByNameAndEnv(folderName, singleVisibleEnv.slug);

      if (!folder) {
        // Folder might be a pending create — just remove it
        const pendingCreate = pendingChanges.folders.find(
          (c) => c.type === PendingAction.Create && c.folderName === folderName
        );
        if (pendingCreate) {
          removePendingChange(pendingCreate.id, "folder", {
            projectId,
            environment: singleVisibleEnv.slug,
            secretPath
          });
        }
        handlePopUpClose("deleteFolder");
        return;
      }

      addPendingChange(
        {
          id: folder.id,
          resourceType: "folder",
          type: PendingAction.Delete,
          folderName,
          folderPath: secretPath,
          timestamp: Date.now()
        },
        { projectId, environment: singleVisibleEnv.slug, secretPath }
      );
      handlePopUpClose("deleteFolder");
      return;
    }

    const promises = userAvailableEnvs
      .filter((env) =>
        permission.can(
          ProjectPermissionActions.Delete,
          subject(ProjectPermissionSub.SecretFolders, {
            environment: env.slug,
            secretPath
          })
        )
      )
      .map((env) => {
        const folder = getFolderByNameAndEnv(folderName, env.slug);
        if (!folder) return undefined;

        return deleteFolder({
          folderId: folder.id,
          path: secretPath,
          environment: env.slug,
          projectId
        });
      })
      .filter(Boolean);

    if (promises.length === 0) {
      createNotification({
        type: "info",
        text: "You don't have access to delete this folder in any environment"
      });
      handlePopUpClose("deleteFolder");
      return;
    }

    try {
      await Promise.all(promises);
      createNotification({
        type: "success",
        text: "Successfully deleted folder"
      });
    } catch {
      createNotification({
        type: "error",
        text: "Failed to delete folder"
      });
    } finally {
      handlePopUpClose("deleteFolder");
    }
  };

  const handleDynamicSecretDelete = async () => {
    const { name, environment, isForced } = popUp.deleteDynamicSecret.data as TDynamicSecret & {
      environment: string;
      isForced?: boolean;
    };
    try {
      await deleteDynamicSecret.mutateAsync({
        environmentSlug: environment,
        projectSlug,
        path: secretPath,
        name,
        isForced
      });
      handlePopUpClose("deleteDynamicSecret");
      createNotification({
        type: "success",
        text: "Successfully deleted dynamic secret"
      });
    } catch {
      createNotification({
        type: "error",
        text: "Failed to delete dynamic secret"
      });
    }
  };

  const handleSecretImportDelete = async () => {
    const secretImportData = popUp.deleteSecretImport?.data as TSecretImport;
    if (!secretImportData || !secretImportData.environment) return;

    try {
      await deleteSecretImport({
        projectId,
        environment: secretImportData.environment,
        path: secretPath,
        id: secretImportData.id
      });
      handlePopUpClose("deleteSecretImport");
      createNotification({
        type: "success",
        text: "Successfully removed secret link"
      });
    } catch {
      createNotification({
        type: "error",
        text: "Failed to remove secret link"
      });
    }
  };

  const handleDeleteEnvironment = async () => {
    const { id } = popUp.deleteEnv.data as { id: string };
    if (!id) return;

    await deleteWsEnvironment({ projectId: currentProject.id, id });
    createNotification({ text: "Successfully removed environment", type: "success" });
    handlePopUpClose("deleteEnv");
  };

  const handleSecretImportReorder: DragEndEvent = (event) => {
    if (event.canceled) return;
    const { source } = event.operation;
    if (!source || !isSortable(source)) return;

    const oldIndex = source.sortable.initialIndex;
    const newIndex = source.sortable.index;
    if (oldIndex === newIndex) return;

    // sortableImportItems excludes reserved imports, so UI indices don't map 1:1
    // to DB positions when replications are present. Use the DB position of the
    // item currently at the target slot.
    const targetPosition = Number(sortableImportItems[newIndex].position);

    const newImportOrder = arrayMove(sortableImportItems, oldIndex, newIndex);
    setSortableImportItems(newImportOrder);
    updateSecretImport({
      projectId,
      environment: singleEnvSlug,
      path: secretPath,
      id: source.id as string,
      import: {
        position: targetPosition
      }
    });
  };

  const handleSecretCreate = async (
    env: string,
    key: string,
    value: string,
    type = SecretType.Shared
  ) => {
    if (isBatchModeActive) {
      addPendingChange(
        {
          id: crypto.randomUUID(),
          resourceType: "secret",
          type: PendingAction.Create,
          secretKey: key,
          secretValue: value,
          secretComment: "",
          timestamp: Date.now()
        },
        { projectId, environment: env, secretPath }
      );
      return;
    }

    // create folder if not existing
    if (secretPath !== "/") {
      // /hello/world -> [hello","world"]
      const pathSegment = secretPath.split("/").filter(Boolean);
      const parentPath = `/${pathSegment.slice(0, -1).join("/")}`;
      const folderName = pathSegment.at(-1);
      const canCreateFolder = permission.can(
        ProjectPermissionActions.Create,
        subject(ProjectPermissionSub.SecretFolders, {
          environment: env,
          secretPath: parentPath
        })
      );
      if (folderName && parentPath && canCreateFolder) {
        await getOrCreateFolder({
          projectId,
          path: parentPath,
          environment: env,
          name: folderName
        });
      }
    }
    const result = await createSecretV3({
      environment: env,
      projectId,
      secretPath,
      secretKey: key,
      secretValue: value,
      secretComment: "",
      type
    });

    if ("approval" in result) {
      createNotification({
        type: "info",
        text: "Requested change has been sent for review"
      });
    } else {
      createNotification({
        type: "success",
        text: "Successfully created secret"
      });
    }
  };

  const handleSecretUpdate = async ({
    env,
    key,
    value,
    secretValueHidden,
    type = SecretType.Shared,
    newSecretName,
    secretComment,
    tags: updatedTags,
    secretMetadata: updatedMetadata,
    skipMultilineEncoding: updatedSkipMultilineEncoding,
    originalValue: providedOriginalValue
  }: {
    env: string;
    key: string;
    value: string | undefined;
    secretValueHidden: boolean;
    type?: SecretType;
    secretId?: string;
    newSecretName?: string;
    secretComment?: string;
    tags?: { id: string; slug: string }[];
    secretMetadata?: { key: string; value: string; isEncrypted?: boolean }[];
    skipMultilineEncoding?: boolean | null;
    originalValue?: string;
  }) => {
    if (isBatchModeActive) {
      const existingSecret = getSecretByKey(env, key);

      let batchSecretValue: string | undefined = value;
      if (
        secretValueHidden &&
        (value === HIDDEN_SECRET_VALUE_API_MASK || value === HIDDEN_SECRET_VALUE)
      ) {
        batchSecretValue = undefined;
      }

      if (!existingSecret) {
        // Secret might be a pending create — find it in pending changes
        const pendingCreate = pendingChanges.secrets.find(
          (c) => c.type === PendingAction.Create && c.secretKey === key
        );
        if (!pendingCreate) return;

        // Send as an Update so the store merges it into the existing Create
        addPendingChange(
          {
            id: pendingCreate.id,
            resourceType: "secret",
            type: PendingAction.Update,
            secretKey: key,
            newSecretName,
            originalValue: "",
            secretValue: batchSecretValue,
            originalComment: "",
            secretComment,
            originalSkipMultilineEncoding: false,
            skipMultilineEncoding:
              updatedSkipMultilineEncoding !== undefined
                ? (updatedSkipMultilineEncoding ?? false)
                : undefined,
            originalTags: [],
            tags: updatedTags,
            originalSecretMetadata: [],
            secretMetadata: updatedMetadata,
            existingSecret: undefined as unknown as SecretV3RawSanitized, // scott: using "update" to update a pending create
            timestamp: Date.now()
          },
          { projectId, environment: env, secretPath }
        );
        return;
      }

      addPendingChange(
        {
          id: existingSecret.id,
          resourceType: "secret",
          type: PendingAction.Update,
          secretKey: key,
          newSecretName,
          originalValue: providedOriginalValue ?? existingSecret.value,
          secretValue: batchSecretValue,
          originalComment: existingSecret.comment,
          secretComment,
          originalSkipMultilineEncoding: existingSecret.skipMultilineEncoding ?? false,
          skipMultilineEncoding:
            updatedSkipMultilineEncoding !== undefined
              ? (updatedSkipMultilineEncoding ?? false)
              : undefined,
          originalTags: existingSecret.tags?.map((tag) => ({ id: tag.id, slug: tag.slug })),
          tags: updatedTags,
          originalSecretMetadata: existingSecret.secretMetadata?.map((m) => ({
            key: m.key,
            value: m.value
          })),
          secretMetadata: updatedMetadata,
          existingSecret,
          timestamp: Date.now()
        },
        { projectId, environment: env, secretPath }
      );
      return;
    }

    let secretValue: string | undefined = value;

    if (
      secretValueHidden &&
      (value === HIDDEN_SECRET_VALUE_API_MASK || value === HIDDEN_SECRET_VALUE)
    ) {
      secretValue = undefined;
    }

    const result = await updateSecretV3({
      environment: env,
      projectId,
      secretPath,
      secretKey: key,
      secretValue,
      type,
      newSecretName
    });

    if ("approval" in result) {
      createNotification({
        type: "info",
        text: "Requested change has been sent for review"
      });
    } else {
      createNotification({
        type: "success",
        text: "Successfully updated secret"
      });
    }
  };

  const handleSecretDelete = async (
    env: string,
    key: string,
    secretId?: string,
    type = SecretType.Shared
  ) => {
    if (isBatchModeActive) {
      const existingSecret = getSecretByKey(env, key);

      if (!existingSecret) {
        // Secret might be a pending create — just remove it
        const pendingCreate = pendingChanges.secrets.find(
          (c) => c.type === PendingAction.Create && c.secretKey === key
        );
        if (pendingCreate) {
          removePendingChange(pendingCreate.id, "secret", {
            projectId,
            environment: env,
            secretPath
          });
        }
        return;
      }

      addPendingChange(
        {
          id: existingSecret.id,
          resourceType: "secret",
          type: PendingAction.Delete,
          secretKey: key,
          secretValue: existingSecret.value ?? "",
          secretValueHidden: !existingSecret.value,
          tags: existingSecret.tags?.map((tag) => ({ id: tag.id, slug: tag.slug })) ?? [],
          secretMetadata: existingSecret.secretMetadata ?? [],
          skipMultilineEncoding: existingSecret.skipMultilineEncoding ?? false,
          comment: existingSecret.comment ?? "",
          timestamp: Date.now()
        },
        { projectId, environment: env, secretPath }
      );
      return;
    }

    const result = await deleteSecretV3({
      environment: env,
      projectId,
      secretPath,
      secretKey: key,
      secretId,
      type
    });

    if ("approval" in result) {
      createNotification({
        type: "info",
        text: "Requested change has been sent for review"
      });
    } else {
      createNotification({
        type: "success",
        text: "Successfully deleted secret"
      });
    }
  };

  // Batch mode: merged data for display
  const mergedSecKeys = useMemo(() => {
    if (!isBatchModeActive) return secKeys;

    // If resource filter is active and secrets are excluded, don't add pending creates
    if (isFilteredByResources && !filter.secret) return secKeys;

    const result = [...secKeys];
    const searchLower = debouncedSearchFilter.toLowerCase();
    pendingChanges.secrets.forEach((change) => {
      if (change.type === PendingAction.Create && !result.includes(change.secretKey)) {
        if (!searchLower || change.secretKey.toLowerCase().includes(searchLower)) {
          result.unshift(change.secretKey);
        }
      }
    });
    return result;
  }, [
    secKeys,
    isBatchModeActive,
    pendingChanges.secrets,
    debouncedSearchFilter,
    isFilteredByResources,
    filter.secret
  ]);

  const getSecretByKeyWithPending = useCallback(
    (env: string, key: string) => {
      if (!isBatchModeActive) return getSecretByKey(env, key);

      // Check for pending create
      const pendingCreate = pendingChanges.secrets.find(
        (c) => c.type === PendingAction.Create && c.secretKey === key
      );
      if (pendingCreate && pendingCreate.type === PendingAction.Create) {
        return {
          id: pendingCreate.id,
          key: pendingCreate.secretKey,
          value: pendingCreate.secretValue,
          comment: pendingCreate.secretComment || "",
          env,
          type: SecretType.Shared,
          tags:
            pendingCreate.tags?.map((tag) => ({ ...tag, createdAt: "", updatedAt: "" }) as WsTag) ??
            [],
          secretMetadata: pendingCreate.secretMetadata ?? [],
          skipMultilineEncoding: pendingCreate.skipMultilineEncoding ?? false,
          version: 0,
          createdAt: "",
          updatedAt: "",
          secretValueHidden: false,
          isPending: true,
          pendingAction: PendingAction.Create
        } as SecretV3RawSanitized;
      }

      const existing = getSecretByKey(env, key);
      if (!existing) return existing;

      // Check for pending update
      const pendingUpdate = pendingChanges.secrets.find(
        (c) => c.type === PendingAction.Update && c.secretKey === key
      );
      if (pendingUpdate && pendingUpdate.type === PendingAction.Update) {
        return {
          ...existing,
          key: pendingUpdate.newSecretName || existing.key,
          value:
            pendingUpdate.secretValue !== undefined ? pendingUpdate.secretValue : existing.value,
          comment:
            pendingUpdate.secretComment !== undefined
              ? pendingUpdate.secretComment
              : existing.comment,
          tags: pendingUpdate.tags !== undefined ? pendingUpdate.tags : existing.tags,
          secretMetadata:
            pendingUpdate.secretMetadata !== undefined
              ? pendingUpdate.secretMetadata
              : existing.secretMetadata,
          skipMultilineEncoding:
            pendingUpdate.skipMultilineEncoding !== undefined
              ? pendingUpdate.skipMultilineEncoding
              : existing.skipMultilineEncoding,
          isPending: true,
          hasPendingValueChange: pendingUpdate.secretValue !== undefined,
          pendingAction: PendingAction.Update
        } as SecretV3RawSanitized;
      }

      // Check for pending delete
      const pendingDelete = pendingChanges.secrets.find(
        (c) => c.type === PendingAction.Delete && c.secretKey === key
      );
      if (pendingDelete) {
        return {
          ...existing,
          isPending: true,
          pendingAction: PendingAction.Delete
        } as SecretV3RawSanitized;
      }

      return existing;
    },
    [getSecretByKey, isBatchModeActive, pendingChanges.secrets]
  );

  const mergedFolderNamesAndDescriptions = useMemo(() => {
    if (!isBatchModeActive)
      return folderNamesAndDescriptions.map((f) => ({ ...f, pendingAction: undefined }));

    const result = folderNamesAndDescriptions.map((f) => ({
      ...f,
      pendingAction: undefined as PendingAction | undefined
    }));

    // If resource filter is active and folders are excluded, skip pending folder creates
    const includePendingFolderCreates = !isFilteredByResources || filter.folder;

    const searchLower = debouncedSearchFilter.toLowerCase();
    pendingChanges.folders.forEach((change) => {
      if (change.type === PendingAction.Create) {
        if (
          includePendingFolderCreates &&
          (!searchLower || change.folderName.toLowerCase().includes(searchLower))
        ) {
          result.unshift({
            name: change.folderName,
            description: change.description,
            pendingAction: PendingAction.Create
          });
        }
      } else if (change.type === PendingAction.Update) {
        const idx = result.findIndex((f) => f.name === change.originalFolderName);
        if (idx >= 0) {
          result[idx] = {
            ...result[idx],
            name: change.folderName,
            description:
              change.description !== undefined ? change.description : result[idx].description,
            pendingAction: PendingAction.Update
          };
        }
      } else if (change.type === PendingAction.Delete) {
        const idx = result.findIndex((f) => f.name === change.folderName);
        if (idx >= 0) {
          result[idx] = {
            ...result[idx],
            pendingAction: PendingAction.Delete
          };
        }
      }
    });

    return result;
  }, [
    folderNamesAndDescriptions,
    isBatchModeActive,
    pendingChanges.folders,
    debouncedSearchFilter,
    isFilteredByResources,
    filter.folder
  ]);

  // Batch mode: revert a pending change (e.g. when user reverts value to original)
  const handleBatchRevert = useCallback(
    (env: string, key: string) => {
      if (!isBatchModeActive) return;
      const pendingSecret = pendingChanges.secrets.find((c) => c.secretKey === key);
      if (pendingSecret) {
        removePendingChange(pendingSecret.id, "secret", {
          projectId,
          environment: env,
          secretPath
        });
      }
    },
    [isBatchModeActive, pendingChanges.secrets, removePendingChange, projectId, secretPath]
  );

  const handleBatchFolderRevert = useCallback(
    (folderName: string) => {
      if (!isBatchModeActive || !singleVisibleEnv) return;
      const pendingFolder = pendingChanges.folders.find(
        (c) =>
          c.folderName === folderName ||
          (c.type === PendingAction.Update && c.originalFolderName === folderName)
      );
      if (pendingFolder) {
        removePendingChange(pendingFolder.id, "folder", {
          projectId,
          environment: singleVisibleEnv.slug,
          secretPath
        });
      }
    },
    [
      isBatchModeActive,
      singleVisibleEnv,
      pendingChanges.folders,
      removePendingChange,
      projectId,
      secretPath
    ]
  );

  // Batch mode: commit handler
  const handleCreateCommit = useCallback(
    async (changes: PendingChanges, message: string) => {
      if (!singleVisibleEnv) return;

      await createCommit({
        projectId,
        environment: singleVisibleEnv.slug,
        secretPath,
        pendingChanges: changes,
        message
      });

      const hasOnlyFolderChanges = changes.folders.length > 0 && changes.secrets.length === 0;
      const requiresApproval = isProtectedBranch && !hasOnlyFolderChanges;

      if (!requiresApproval) {
        changes.secrets.forEach((secret) => {
          if (secret.type === PendingAction.Update && secret.secretValue !== undefined) {
            queryClient.setQueryData(
              dashboardKeys.getSecretValue({
                projectId,
                environment: singleVisibleEnv.slug,
                secretPath,
                secretKey: secret.newSecretName ?? secret.secretKey,
                isOverride: false
              }),
              { value: secret.secretValue }
            );
          }
        });
      }

      // Invalidate overview queries
      await queryClient.invalidateQueries({
        queryKey: dashboardKeys.getDashboardSecrets({ projectId, secretPath })
      });

      createNotification({
        text: requiresApproval
          ? "Requested changes have been sent for review"
          : "Changes saved successfully",
        type: "success"
      });
    },
    [singleVisibleEnv, projectId, secretPath, isProtectedBranch, queryClient, createCommit]
  );

  // Batch mode: toggle
  const toggleBatchMode = useCallback(() => {
    if (isOverviewBatchMode && singleVisibleEnv) {
      const totalChanges = pendingChanges.secrets.length + pendingChanges.folders.length;
      if (totalChanges > 0) {
        handlePopUpOpen("confirmDisableBatchMode");
        return;
      }
    }
    setIsOverviewBatchMode((prev) => {
      const next = !prev;
      if (next) localStorage.setItem(OVERVIEW_BATCH_MODE_KEY, "true");
      else localStorage.removeItem(OVERVIEW_BATCH_MODE_KEY);
      return next;
    });
  }, [isOverviewBatchMode, singleVisibleEnv, pendingChanges, handlePopUpOpen]);

  const handleConfirmDisableBatchMode = useCallback(() => {
    if (singleVisibleEnv) {
      clearAllPendingChanges({
        projectId,
        environment: singleVisibleEnv.slug,
        secretPath
      });
    }
    setIsOverviewBatchMode(false);
    localStorage.removeItem(OVERVIEW_BATCH_MODE_KEY);
    handlePopUpClose("confirmDisableBatchMode");
  }, [singleVisibleEnv, clearAllPendingChanges, projectId, secretPath, handlePopUpClose]);

  const handleResetSearch = (path: string) => {
    const restore = filterHistory.get(path);
    setFilter(restore?.filter ?? DEFAULT_FILTER_STATE);
    const el = restore?.searchFilter ?? "";
    setSearchFilter(el);
    setDebouncedSearchFilter(el);
  };

  const handleFolderClick = (path: string) => {
    if (isOverviewFetching) return;

    // store for breadcrumb nav to restore previously used filters
    setFilterHistory((prev) => {
      const curr = new Map(prev);
      curr.set(secretPath, { filter, searchFilter });
      return curr;
    });

    navigate({
      search: (prev) => ({
        ...prev,
        secretPath: `${routerSearch.secretPath === "/" ? "" : routerSearch.secretPath}/${path}`
      })
    }).then(() => {
      setFilter(DEFAULT_FILTER_STATE);
      setSearchFilter("");
      setDebouncedSearchFilter("");
    });
  };

  const handleToggleRowType = useCallback(
    (rowType: RowType) =>
      setFilter((state) => {
        return {
          ...state,
          [rowType]: !state[rowType]
        };
      }),
    []
  );

  const allRowsSelectedOnPage = useMemo(() => {
    if (!secrets?.length && !folders?.length) return { isChecked: false, isIndeterminate: false };

    if (
      (!secrets?.length ||
        secrets?.every((secret) => selectedEntries[EntryType.SECRET][secret.key])) &&
      (!folders?.length ||
        folders?.every((folder) => selectedEntries[EntryType.FOLDER][folder.name]))
    )
      return { isChecked: true, isIndeterminate: false };

    if (
      secrets?.some((secret) => selectedEntries[EntryType.SECRET][secret.key]) ||
      folders?.some((folder) => selectedEntries[EntryType.FOLDER][folder.name])
    )
      return { isChecked: true, isIndeterminate: true };

    return { isChecked: false, isIndeterminate: false };
  }, [selectedEntries, secrets, folders]);

  const toggleSelectedEntry = useCallback(
    (type: EntryType, key: string) => {
      const isChecked = Boolean(selectedEntries[type]?.[key]);
      const newChecks = { ...selectedEntries };

      // remove selection if its present else add it
      if (isChecked) {
        delete newChecks[type][key];
      } else {
        newChecks[type][key] = {};
        userAvailableEnvs.forEach((env) => {
          const resource =
            type === EntryType.SECRET
              ? getSecretByKey(env.slug, key)
              : getFolderByNameAndEnv(key, env.slug);

          if (resource) newChecks[type][key][env.slug] = resource;
        });
      }

      setSelectedEntries(newChecks);
    },
    [selectedEntries, getFolderByNameAndEnv, getSecretByKey]
  );

  const toggleSelectAllRows = () => {
    const newChecks = { ...selectedEntries };

    userAvailableEnvs.forEach((env) => {
      secrets?.forEach((secret) => {
        if (allRowsSelectedOnPage.isChecked) {
          delete newChecks[EntryType.SECRET][secret.key];
        } else {
          if (!newChecks[EntryType.SECRET][secret.key])
            newChecks[EntryType.SECRET][secret.key] = {};

          const resource = getSecretByKey(env.slug, secret.key);

          if (resource) newChecks[EntryType.SECRET][secret.key][env.slug] = resource;
        }
      });

      folders?.forEach((folder) => {
        if (allRowsSelectedOnPage.isChecked) {
          delete newChecks[EntryType.FOLDER][folder.name];
        } else {
          if (!newChecks[EntryType.FOLDER][folder.name])
            newChecks[EntryType.FOLDER][folder.name] = {};

          const resource = getFolderByNameAndEnv(folder.name, env.slug);

          if (resource) newChecks[EntryType.FOLDER][folder.name][env.slug] = resource;
        }
      });
    });

    setSelectedEntries(newChecks);
  };

  const selectedKeysCount = Object.keys(selectedEntries.secret).length;

  const secretsToDeleteKeys = useMemo(() => {
    return Object.values(selectedEntries.secret).flatMap((entries) =>
      Object.values(entries).map((secret) => secret.key)
    );
  }, [selectedEntries]);

  const filterAndMergeEnvironments = (
    envNames: string[],
    envs: { environment: string; importedBy: ProjectSecretsImportedBy[] }[]
  ): ProjectSecretsImportedBy[] => {
    const environments = envs.filter((env) => envNames.includes(env.environment));

    if (environments.length === 0) return [];

    const allImportedBy = environments.flatMap((env) => env.importedBy);
    const groupedBySlug: Record<string, ProjectSecretsImportedBy[]> = {};

    allImportedBy.forEach((item) => {
      const { slug } = item.environment;
      if (!groupedBySlug[slug]) groupedBySlug[slug] = [];
      groupedBySlug[slug].push(item);
    });

    const mergedImportedBy = Object.values(groupedBySlug).map((group) => {
      const { environment } = group[0];
      const allFolders = group.flatMap((item) => item.folders);

      const foldersByName: Record<string, (typeof allFolders)[number][]> = {};
      allFolders.forEach((folder) => {
        if (!foldersByName[folder.name]) foldersByName[folder.name] = [];
        foldersByName[folder.name].push(folder);
      });

      const mergedFolders = Object.entries(foldersByName).map(([name, foldersData]) => {
        const isImported = foldersData.some((folder) => folder.isImported);
        const allSecrets = foldersData.flatMap((folder) => folder.secrets || []);

        const uniqueSecrets: {
          secretId: string;
          referencedSecretKey: string;
          referencedSecretEnv: string;
        }[] = [];
        const secretIds = new Set<string>();

        allSecrets
          .filter(
            (secret) =>
              !secretsToDeleteKeys ||
              secretsToDeleteKeys.length === 0 ||
              secretsToDeleteKeys.includes(secret.referencedSecretKey)
          )
          .forEach((secret) => {
            if (!secretIds.has(secret.secretId)) {
              secretIds.add(secret.secretId);
              uniqueSecrets.push(secret);
            }
          });

        return {
          name,
          isImported,
          ...(uniqueSecrets.length > 0 ? { secrets: uniqueSecrets } : {})
        };
      });

      return {
        environment,
        folders: mergedFolders.filter(
          (folder) => folder.isImported || (folder.secrets && folder.secrets.length > 0)
        )
      };
    });

    return mergedImportedBy;
  };

  const importedBy = useMemo(() => {
    if (!importedByEnvs) return [];
    if (selectedKeysCount === 0) {
      return filterAndMergeEnvironments(
        visibleEnvs.map(({ slug }) => slug),
        importedByEnvs
      );
    }
    return filterAndMergeEnvironments(
      Object.values(selectedEntries.secret).flatMap((entries) => Object.keys(entries)),
      importedByEnvs
    );
  }, [importedByEnvs, selectedEntries, selectedKeysCount]);

  // scott: keeping incase we add back header adjustments
  // const storedHeight = Number.parseInt(
  //   localStorage.getItem("overview-header-height") ?? DEFAULT_COLLAPSED_HEADER_HEIGHT.toString(),
  //   10
  // );
  // const { headerHeight, handleMouseDown, isResizing } = useResizableHeaderHeight({
  //   initialHeight: Number.isNaN(storedHeight) ? DEFAULT_COLLAPSED_HEADER_HEIGHT : storedHeight,
  //   minHeight: DEFAULT_COLLAPSED_HEADER_HEIGHT,
  //   maxHeight: 288
  // });
  // const debouncedHeaderHeight = useDebounce(headerHeight);
  // useEffect(() => {
  //   localStorage.setItem("overview-header-height", debouncedHeaderHeight.toString());
  // }, [debouncedHeaderHeight]);

  const [tableWidth, setTableWidth] = useState(0);

  const hasPendingCreates =
    mergedSecKeys.length > secKeys.length ||
    mergedFolderNamesAndDescriptions.some((f) => f.pendingAction === PendingAction.Create);
  const isTableEmpty = totalCount === 0 && !hasPendingCreates && !isOverviewLoading;

  useEffect(() => {
    // track previous page size to make navigation loading rows less janky
    if (!isOverviewLoading) prevPageSize.current = Math.min(perPage, totalCount);
  }, [isOverviewLoading, totalCount, perPage]);

  useEffect(() => {
    const element = tableRef.current;
    if (!element) return;

    const handleResize = () => {
      setTableWidth(element.clientWidth);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(element);

    // eslint-disable-next-line consistent-return
    return () => {
      resizeObserver.disconnect();
    };
  }, [tableRef, isTableEmpty]);

  // This is needed to also show imports from other paths – right now those are missing.
  // const combinedKeys = [...secKeys, ...secretImports.map((impSecrets) => impSecrets?.data?.map((impSec) => impSec.secrets?.map((impSecKey) => impSecKey.key))).flat().flat()];

  const isTableFiltered = isFilteredByResources;

  if (!isProjectV3)
    return (
      <div className="flex h-full w-full flex-col items-center justify-center px-6 text-mineshaft-50 dark:scheme-dark">
        <SecretV2MigrationSection />
      </div>
    );

  const dynamicSecretLeaseData = popUp.dynamicSecretLeases?.data as
    | (TDynamicSecret & { environment: string })
    | undefined;

  return (
    <div className="">
      <Helmet>
        <title>{t("common.head-title", { title: t("dashboard.title") })}</title>
        <meta property="og:title" content={String(t("dashboard.og-title"))} />
        <meta name="og:description" content={String(t("dashboard.og-description"))} />
      </Helmet>
      <div className="relative mx-auto mb-18 max-w-8xl text-mineshaft-50 dark:scheme-dark">
        <div className="flex w-full items-baseline justify-between">
          <PageHeader
            scope={ProjectType.SecretManager}
            title="Project Overview"
            description={
              <p className="text-md text-bunker-300">
                Inject your secrets using
                <a
                  className="ml-1 text-mineshaft-200 underline decoration-mineshaft-400/65 underline-offset-3 duration-200 hover:text-mineshaft-100 hover:decoration-primary-600"
                  href="https://infisical.com/docs/cli/overview"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Infisical CLI
                </a>
                ,
                <a
                  className="ml-1 text-mineshaft-200 underline decoration-mineshaft-400/65 underline-offset-3 duration-200 hover:text-mineshaft-100 hover:decoration-primary-600"
                  href="https://infisical.com/docs/api-reference/overview/introduction"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Infisical API
                </a>
                ,
                <a
                  className="ml-1 text-mineshaft-200 underline decoration-mineshaft-400/65 underline-offset-3 duration-200 hover:text-mineshaft-100 hover:decoration-primary-600"
                  href="https://infisical.com/docs/sdks/overview"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Infisical SDKs
                </a>
                , and
                <a
                  className="ml-1 text-mineshaft-200 underline decoration-mineshaft-400/65 underline-offset-3 duration-200 hover:text-mineshaft-100 hover:decoration-primary-600"
                  href="https://infisical.com/docs/documentation/getting-started/introduction"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  more
                </a>
                . Click the Explore button to view the secret details section.
              </p>
            }
          />
        </div>

        <SelectionPanel
          secretPath={secretPath}
          selectedEntries={selectedEntries}
          resetSelectedEntries={resetSelectedEntries}
          importedBy={importedBy}
          secretsToDeleteKeys={secretsToDeleteKeys}
          usedBySecretSyncs={usedBySecretSyncs}
          visibleEnvs={visibleEnvs}
        />

        <UnstableCard>
          <UnstableCardHeader>
            <div className="flex flex-col gap-3 overflow-hidden dashboard:flex-row dashboard:items-center">
              <div className="flex flex-1 items-center gap-x-3 overflow-hidden whitespace-nowrap dashboard:mr-auto">
                <EnvironmentSelect
                  selectedEnvs={filteredEnvs}
                  setSelectedEnvs={setFilteredEnvs}
                  isDisabled={
                    isBatchModeActive &&
                    (pendingChanges.secrets.length > 0 || pendingChanges.folders.length > 0)
                  }
                />
                <FolderBreadcrumb secretPath={secretPath} onResetSearch={handleResetSearch} />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {userAvailableEnvs.length > 0 && (
                  <DownloadEnvButton
                    secretPath={secretPath}
                    environments={visibleEnvs}
                    projectId={projectId}
                  />
                )}
                {userAvailableEnvs.length > 0 && (
                  <ResourceFilter rowTypeFilter={filter} onToggleRowType={handleToggleRowType} />
                )}
                <ResourceSearchInput
                  value={searchFilter}
                  tags={tags}
                  onChange={setSearchFilter}
                  environments={userAvailableEnvs}
                  projectId={currentProject?.id}
                />
                {userAvailableEnvs.length > 0 && (
                  <AddResourceButtons
                    onAddSecret={() => handlePopUpOpen("addSecretsInAllEnvs")}
                    onAddFolder={() => {
                      handlePopUpOpen("addFolder");
                    }}
                    onImportSecrets={() => handlePopUpOpen("importSecrets")}
                    onAddDyanamicSecret={() => {
                      if (subscription?.dynamicSecret) {
                        handlePopUpOpen("addDynamicSecret");
                        return;
                      }
                      handlePopUpOpen("upgradePlan", {
                        isEnterpriseFeature: true,
                        text: "Adding dynamic secrets can be unlocked if you upgrade to Infisical Enterprise plan."
                      });
                    }}
                    onAddSecretRotation={() => {
                      if (subscription?.secretRotation) {
                        handlePopUpOpen("addSecretRotation");
                        return;
                      }
                      handlePopUpOpen("upgradePlan", {
                        text: "Adding secret rotations can be unlocked if you upgrade to Infisical Pro plan."
                      });
                    }}
                    onReplicateSecrets={() => handlePopUpOpen("replicateFolder")}
                    isDyanmicSecretAvailable={userAvailableDynamicSecretEnvs.length > 0}
                    isSecretRotationAvailable={userAvailableSecretRotationEnvs.length > 0}
                    isReplicateSecretsAvailable={visibleEnvs.length === 1}
                    onAddSecretImport={handleAddSecretImport}
                    isSecretImportAvailable={userAvailableSecretImportEnvs.length > 0}
                    isSingleEnvSelected={isSingleEnvView}
                    hasVaultConnection={hasVaultConnection}
                    isOrgAdmin={isOrgAdmin}
                    onImportFromVault={() => handlePopUpOpen("importFromVault")}
                  />
                )}
              </div>
            </div>
          </UnstableCardHeader>
          <UnstableCardContent>
            {isSingleEnvView &&
              hasPathPolicies &&
              // eslint-disable-next-line no-nested-ternary
              (!canReadSecrets ? (
                <UnstableAlert variant="info" className="mb-6 py-1.5">
                  <InfoIcon className="mt-1" />
                  <UnstableAlertTitle className="flex items-center">
                    <span>You do not have permission to read secrets in this folder</span>
                    <Button
                      variant="outline"
                      size="xs"
                      className="ml-auto"
                      onClick={() =>
                        handlePopUpOpen("requestAccess", [ProjectPermissionActions.Read])
                      }
                    >
                      Request Access
                    </Button>
                  </UnstableAlertTitle>
                </UnstableAlert>
              ) : !canCreateSecrets || !canEditSecrets || !canDeleteSecrets ? (
                <UnstableAlert variant="info" className="mb-6 py-1.5">
                  <InfoIcon className="mt-1" />
                  <UnstableAlertTitle className="flex items-center">
                    <span>
                      You do not have permission to{" "}
                      {(() => {
                        const missing = [
                          ...(!canCreateSecrets ? ["create"] : []),
                          ...(!canEditSecrets ? ["edit"] : []),
                          ...(!canDeleteSecrets ? ["delete"] : [])
                        ];
                        if (missing.length <= 2) return missing.join(" or ");
                        return `${missing.slice(0, -1).join(", ")}, or ${missing[missing.length - 1]}`;
                      })()}{" "}
                      secrets in this folder
                    </span>
                    <Button
                      variant="outline"
                      size="xs"
                      className="ml-auto"
                      onClick={() =>
                        handlePopUpOpen("requestAccess", [
                          ...(!canCreateSecrets ? [ProjectPermissionActions.Create] : []),
                          ...(!canEditSecrets ? [ProjectPermissionActions.Edit] : []),
                          ...(!canDeleteSecrets ? [ProjectPermissionActions.Delete] : [])
                        ])
                      }
                    >
                      Request Access
                    </Button>
                  </UnstableAlertTitle>
                </UnstableAlert>
              ) : null)}
            {
              // eslint-disable-next-line no-nested-ternary
              isTableEmpty ? (
                isTableFiltered ||
                debouncedSearchFilter ||
                permission.cannot(
                  ProjectPermissionSecretActions.Create,
                  ProjectPermissionSub.Secrets
                ) ? (
                  <EmptyResourceDisplay
                    isFiltered={isTableFiltered || Boolean(debouncedSearchFilter)}
                  />
                ) : (
                  <div className="relative">
                    {isSingleEnvView && (
                      <div className="absolute top-2 right-3 z-50 mb-4 flex items-center justify-end gap-2">
                        {isProtectedBranch && (
                          <Tooltip>
                            <TooltipTrigger>
                              <Badge variant="info">
                                <LockIcon />
                                Protected
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              Protected
                              {boardPolicy?.name ? ` by policy ${boardPolicy.name}` : ""}
                            </TooltipContent>
                          </Tooltip>
                        )}
                        <Badge asChild variant="neutral">
                          <button
                            type="button"
                            onClick={() => {
                              if (singleVisibleEnv) {
                                handleViewCommitHistory(singleVisibleEnv.slug, singleEnvFolderId);
                              }
                            }}
                          >
                            <GitCommitIcon />
                            {/* eslint-disable-next-line no-nested-ternary */}
                            {subscription.pitRecovery
                              ? isSingleEnvChangesCountLoading
                                ? "Loading..."
                                : `${singleEnvChangesCount} Commit${singleEnvChangesCount === 1 ? "" : "s"}`
                              : "Commit History"}
                          </button>
                        </Badge>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge
                              asChild
                              className={isOverviewBatchMode ? "" : "opacity-75"}
                              variant={isOverviewBatchMode ? "warning" : "neutral"}
                            >
                              <button type="button" onClick={toggleBatchMode}>
                                <GroupIcon />
                                Batch Edit Mode
                              </button>
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            {isOverviewBatchMode
                              ? "Changes are batched together into a single commit. Click to switch to single edit mode."
                              : "Click to enable batch edit mode. Changes will be grouped into a single commit."}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    )}
                    <SecretDropzone
                      onParsedSecrets={(env) => {
                        setImportParsedSecrets(env);
                        handlePopUpOpen("importSecrets");
                      }}
                      onAddSecret={() => handlePopUpOpen("addSecretsInAllEnvs")}
                    />
                  </div>
                )
              ) : (
                <>
                  <DragDropProvider onDragEnd={handleSecretImportReorder}>
                    <UnstableTable ref={tableRef} className="border-separate border-spacing-0">
                      <UnstableTableHeader>
                        <UnstableTableRow className="h-10">
                          <UnstableTableHead className="sticky left-0 z-10 w-[40px] max-w-[40px] min-w-[40px] bg-container">
                            <Checkbox
                              variant="project"
                              isDisabled={totalCount === 0 || hasPendingBatchChanges}
                              id="checkbox-select-all-rows"
                              isChecked={allRowsSelectedOnPage.isChecked}
                              isIndeterminate={allRowsSelectedOnPage.isIndeterminate}
                              onCheckedChange={toggleSelectAllRows}
                            />
                          </UnstableTableHead>
                          <UnstableTableHead
                            className="sticky left-10 z-10 max-w-60 min-w-60 border-r bg-container lg:max-w-none lg:min-w-96"
                            onClick={() =>
                              setOrderDirection((prev) =>
                                prev === OrderByDirection.ASC
                                  ? OrderByDirection.DESC
                                  : OrderByDirection.ASC
                              )
                            }
                          >
                            Name
                            <ChevronDownIcon
                              className={twMerge(
                                orderDirection === OrderByDirection.DESC && "rotate-180",
                                "transition-transform"
                              )}
                            />
                          </UnstableTableHead>
                          {visibleEnvs.length > 1 ? (
                            visibleEnvs?.map(({ name, slug, id }, index) => {
                              return (
                                <UnstableTableHead
                                  className="w-40 max-w-40 border-r p-0 text-center last:border-r-0"
                                  isTruncatable
                                  key={`secret-overview-${name}-${index + 1}`}
                                >
                                  <UnstableDropdownMenu>
                                    <Tooltip>
                                      <TooltipTrigger className="h-full">
                                        <UnstableDropdownMenuTrigger asChild>
                                          <div className="flex h-full w-40 cursor-pointer items-center justify-center gap-x-2 px-3 hover:bg-foreground/5">
                                            <span className="truncate">{name}</span>
                                            <SettingsIcon className="size-3.5 shrink-0" />
                                          </div>
                                        </UnstableDropdownMenuTrigger>
                                      </TooltipTrigger>
                                      <TooltipContent>{name}</TooltipContent>
                                    </Tooltip>
                                    <UnstableDropdownMenuContent align="end">
                                      <UnstableDropdownMenuItem
                                        onClick={() => {
                                          navigator.clipboard.writeText(slug);
                                          createNotification({
                                            type: "info",
                                            text: "Environment slug copied to clipboard"
                                          });
                                        }}
                                      >
                                        <CopyIcon />
                                        Copy Environment Slug
                                      </UnstableDropdownMenuItem>
                                      <UnstableDropdownMenuItem
                                        onClick={async () => {
                                          try {
                                            const {
                                              secrets: envSecrets,
                                              imports: importedSecrets
                                            } = await fetchProjectSecrets({
                                              projectId,
                                              expandSecretReferences: true,
                                              includeImports: true,
                                              environment: slug,
                                              secretPath
                                            });
                                            downloadSecretEnvFile(
                                              slug,
                                              envSecrets,
                                              importedSecrets
                                            );
                                          } catch (err) {
                                            if (err instanceof AxiosError) {
                                              const error = err?.response?.data as TApiErrors;
                                              if (
                                                error?.error === ApiErrorTypes.ForbiddenError &&
                                                error.message.includes("readValue")
                                              ) {
                                                createNotification({
                                                  title:
                                                    "You don't have permission to download secrets",
                                                  text: "You don't have permission to view one or more of the secrets in the current folder. Please contact your administrator.",
                                                  type: "error"
                                                });
                                                return;
                                              }
                                            }
                                            createNotification({
                                              title: "Failed to download secrets",
                                              text: "Please try again later.",
                                              type: "error"
                                            });
                                          }
                                        }}
                                      >
                                        <DownloadIcon />
                                        Download as .env
                                      </UnstableDropdownMenuItem>
                                      <UnstableDropdownMenuItem
                                        onClick={() => handleViewCommitHistory(slug)}
                                      >
                                        <GitCommitIcon />
                                        View Commit History
                                      </UnstableDropdownMenuItem>
                                      <ProjectPermissionCan
                                        I={ProjectPermissionActions.Delete}
                                        a={ProjectPermissionSub.Environments}
                                      >
                                        {(isAllowed) => (
                                          <Tooltip open={!isAllowed ? undefined : false}>
                                            <TooltipTrigger className="block w-full">
                                              <UnstableDropdownMenuItem
                                                isDisabled={!isAllowed}
                                                onClick={() =>
                                                  handlePopUpOpen("deleteEnv", {
                                                    name,
                                                    slug,
                                                    id
                                                  })
                                                }
                                              >
                                                <TrashIcon />
                                                Delete Environment
                                              </UnstableDropdownMenuItem>
                                            </TooltipTrigger>
                                            <TooltipContent side="left">
                                              Access Restricted
                                            </TooltipContent>
                                          </Tooltip>
                                        )}
                                      </ProjectPermissionCan>
                                    </UnstableDropdownMenuContent>
                                  </UnstableDropdownMenu>
                                </UnstableTableHead>
                              );
                            })
                          ) : (
                            <UnstableTableHead className="w-full">
                              <div className="flex w-full items-center justify-between">
                                Value
                                <div className="flex items-center gap-2">
                                  <Badge variant="ghost" asChild>
                                    <button
                                      type="button"
                                      onClick={setIsSingleEnvSecretsVisible.toggle}
                                    >
                                      {isSingleEnvSecretsVisible ? (
                                        <>
                                          <EyeOffIcon />
                                          Hide
                                        </>
                                      ) : (
                                        <>
                                          <EyeIcon />
                                          Reveal
                                        </>
                                      )}{" "}
                                      Values
                                    </button>
                                  </Badge>
                                  {isProtectedBranch && (
                                    <Tooltip>
                                      <TooltipTrigger>
                                        <Badge variant="info">
                                          <LockIcon />
                                          Protected
                                        </Badge>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        Protected
                                        {boardPolicy?.name ? ` by policy ${boardPolicy.name}` : ""}
                                      </TooltipContent>
                                    </Tooltip>
                                  )}
                                  <Badge
                                    asChild
                                    className="float-right cursor-pointer"
                                    variant="neutral"
                                  >
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (singleVisibleEnv) {
                                          handleViewCommitHistory(
                                            singleVisibleEnv.slug,
                                            singleEnvFolderId
                                          );
                                        }
                                      }}
                                    >
                                      <GitCommitIcon />
                                      {/* eslint-disable-next-line no-nested-ternary */}
                                      {subscription.pitRecovery
                                        ? isSingleEnvChangesCountLoading
                                          ? "Loading..."
                                          : `${singleEnvChangesCount} Commit${singleEnvChangesCount === 1 ? "" : "s"}`
                                        : "Commit History"}
                                    </button>
                                  </Badge>
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <Badge
                                        asChild
                                        className={isOverviewBatchMode ? "" : "opacity-75"}
                                        variant={isOverviewBatchMode ? "warning" : "neutral"}
                                      >
                                        <button type="button" onClick={toggleBatchMode}>
                                          <GroupIcon />
                                          Batch Edit Mode
                                        </button>
                                      </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      {isOverviewBatchMode
                                        ? "Changes are batched together into a single commit. Click to switch to single edit mode."
                                        : "Click to enable batch edit mode. Changes will be grouped into a single commit."}
                                    </TooltipContent>
                                  </Tooltip>
                                </div>
                              </div>
                            </UnstableTableHead>
                          )}
                        </UnstableTableRow>
                      </UnstableTableHeader>
                      <UnstableTableBody className="transition-all duration-500">
                        {isOverviewLoading || isPlaceholderData ? (
                          Array.from({ length: prevPageSize.current || perPage }).map(
                            (_, index) => (
                              <UnstableTableRow className="group" key={`loading-row-${index + 1}`}>
                                <UnstableTableCell className="sticky left-0 z-10 bg-container group-hover:bg-container-hover">
                                  <Skeleton className="h-4 w-full" />
                                </UnstableTableCell>
                                <UnstableTableCell className="sticky left-10 z-10 border-r bg-container group-hover:bg-container-hover">
                                  <Skeleton className="h-4 w-full" />
                                </UnstableTableCell>
                                {visibleEnvs.map((env) => {
                                  return (
                                    <UnstableTableCell
                                      className="border-r last:border-r-0"
                                      key={`loading-env-row-${env.slug}+${index + 1}`}
                                    >
                                      <Skeleton className="h-4 w-full" />
                                    </UnstableTableCell>
                                  );
                                })}
                              </UnstableTableRow>
                            )
                          )
                        ) : (
                          <>
                            {isSingleEnvView &&
                              sortableImportItems.map((imp, idx) => (
                                <SecretImportTableRow
                                  key={`overview-import-${imp.id}`}
                                  index={idx}
                                  secretImport={imp}
                                  importEnvSlug={imp.importEnv.slug}
                                  importEnvName={imp.importEnv.name}
                                  importPath={imp.importPath}
                                  environments={visibleEnvs}
                                  isSecretImportInEnv={isSecretImportInEnv}
                                  getSecretImportByEnv={getSecretImportByEnv}
                                  tableWidth={tableWidth}
                                  secretPath={secretPath}
                                  searchFilter={debouncedSearchFilter}
                                  onDelete={(secretImport) =>
                                    handlePopUpOpen("deleteSecretImport", secretImport)
                                  }
                                  importedSecrets={importedSecretsFlat}
                                />
                              ))}
                            {!isSingleEnvView &&
                              secretImportNames.map(
                                ({ importEnvSlug, importEnvName, importPath }, index) => (
                                  <SecretImportTableRow
                                    key={`overview-import-${importEnvSlug}-${importPath}-${index + 1}`}
                                    index={index}
                                    importEnvSlug={importEnvSlug}
                                    importEnvName={importEnvName}
                                    importPath={importPath}
                                    environments={visibleEnvs}
                                    isSecretImportInEnv={isSecretImportInEnv}
                                    getSecretImportByEnv={getSecretImportByEnv}
                                    tableWidth={tableWidth}
                                    secretPath={secretPath}
                                    searchFilter={debouncedSearchFilter}
                                    onDelete={(secretImport) =>
                                      handlePopUpOpen("deleteSecretImport", secretImport)
                                    }
                                    importedSecrets={importedSecretsFlat}
                                  />
                                )
                              )}
                            {mergedFolderNamesAndDescriptions.map(
                              (
                                {
                                  name: folderName,
                                  description,
                                  pendingAction: folderPendingAction
                                },
                                index
                              ) => (
                                <FolderTableRow
                                  folderName={folderName}
                                  description={description}
                                  isFolderPresentInEnv={isFolderPresentInEnv}
                                  isSelected={
                                    !hasPendingBatchChanges &&
                                    Boolean(selectedEntries.folder[folderName])
                                  }
                                  onToggleFolderSelect={() => {
                                    if (!hasPendingBatchChanges)
                                      toggleSelectedEntry(EntryType.FOLDER, folderName);
                                  }}
                                  environments={visibleEnvs}
                                  key={`overview-${folderName}-${index + 1}`}
                                  onClick={handleFolderClick}
                                  onToggleFolderEdit={(name: string) =>
                                    handlePopUpOpen("updateFolder", { name, description })
                                  }
                                  onToggleFolderDelete={(name: string) =>
                                    handlePopUpOpen("deleteFolder", { name })
                                  }
                                  pendingAction={folderPendingAction}
                                  onBatchRevert={handleBatchFolderRevert}
                                  isSelectionDisabled={hasPendingBatchChanges}
                                />
                              )
                            )}
                            {dynamicSecretNames.map((dynamicSecretName, index) => (
                              <DynamicSecretTableRow
                                dynamicSecretName={dynamicSecretName}
                                isDynamicSecretInEnv={isDynamicSecretPresentInEnv}
                                getDynamicSecretByName={getDynamicSecretByName}
                                getDynamicSecretStatusesByName={getDynamicSecretStatusesByName}
                                environments={visibleEnvs}
                                tableWidth={tableWidth}
                                secretPath={secretPath}
                                key={`overview-${dynamicSecretName}-${index + 1}`}
                                onEdit={(dynamicSecret) =>
                                  handlePopUpOpen("editDynamicSecret", dynamicSecret)
                                }
                                onViewLeases={(dynamicSecret) =>
                                  handlePopUpOpen("dynamicSecretLeases", dynamicSecret)
                                }
                                onGenerateLease={(dynamicSecret) =>
                                  handlePopUpOpen("createDynamicSecretLease", dynamicSecret)
                                }
                                onDelete={(dynamicSecret) =>
                                  handlePopUpOpen("deleteDynamicSecret", dynamicSecret)
                                }
                                onForceDelete={(dynamicSecret) =>
                                  handlePopUpOpen("deleteDynamicSecret", {
                                    ...dynamicSecret,
                                    isForced: true
                                  })
                                }
                              />
                            ))}
                            {secretRotationNames.map((secretRotationName, index) => (
                              <SecretRotationTableRow
                                secretRotationName={secretRotationName}
                                isSecretRotationInEnv={isSecretRotationPresentInEnv}
                                environments={visibleEnvs}
                                getSecretRotationByName={getSecretRotationByName}
                                getSecretRotationStatusesByName={getSecretRotationStatusesByName}
                                key={`overview-${secretRotationName}-${index + 1}`}
                                tableWidth={tableWidth}
                                onEdit={(secretRotation) =>
                                  handlePopUpOpen("editSecretRotation", secretRotation)
                                }
                                onRotate={(secretRotation) =>
                                  handlePopUpOpen("rotateSecretRotation", secretRotation)
                                }
                                onReconcile={(secretRotation) =>
                                  handlePopUpOpen("reconcileSecretRotation", secretRotation)
                                }
                                onViewGeneratedCredentials={(secretRotation) =>
                                  handlePopUpOpen(
                                    "viewSecretRotationGeneratedCredentials",
                                    secretRotation
                                  )
                                }
                                onDelete={(secretRotation) =>
                                  handlePopUpOpen("deleteSecretRotation", secretRotation)
                                }
                              />
                            ))}
                            {mergedSecKeys.map((key, index) => (
                              <SecretTableRow
                                isSelected={
                                  !hasPendingBatchChanges && Boolean(selectedEntries.secret[key])
                                }
                                onToggleSecretSelect={() => {
                                  if (!hasPendingBatchChanges)
                                    toggleSelectedEntry(EntryType.SECRET, key);
                                }}
                                secretPath={secretPath}
                                getImportedSecretByKey={getImportedSecretByKey}
                                isImportedSecretPresentInEnv={handleIsImportedSecretPresentInEnv}
                                onSecretCreate={handleSecretCreate}
                                onSecretDelete={handleSecretDelete}
                                onSecretUpdate={handleSecretUpdate}
                                key={`overview-${key}-${index + 1}`}
                                environments={visibleEnvs}
                                secretKey={key}
                                getSecretByKey={getSecretByKeyWithPending}
                                tableWidth={tableWidth}
                                importedBy={importedBy}
                                isSingleEnvSecretsVisible={isSingleEnvSecretsVisible}
                                isBatchMode={isBatchModeActive}
                                onBatchRevert={handleBatchRevert}
                                isSelectionDisabled={hasPendingBatchChanges}
                              />
                            ))}
                            <SecretNoAccessTableRow
                              environments={visibleEnvs}
                              count={Math.max(
                                (page * perPage > totalCount ? totalCount % perPage : perPage) -
                                  (totalUniqueFoldersInPage || 0) -
                                  (totalUniqueDynamicSecretsInPage || 0) -
                                  (totalUniqueSecretsInPage || 0) -
                                  (totalUniqueSecretImportsInPage || 0) -
                                  (totalUniqueSecretRotationsInPage || 0),
                                0
                              )}
                            />
                          </>
                        )}
                      </UnstableTableBody>
                    </UnstableTable>
                    <DragOverlay
                      tag="table"
                      className="w-full caption-bottom text-sm"
                      style={{ width: tableWidth }}
                    >
                      {null}
                    </DragOverlay>
                  </DragDropProvider>
                  <UnstablePagination
                    startAdornment={
                      <ResourceCount
                        dynamicSecretCount={totalDynamicSecretCount}
                        secretCount={totalSecretCount}
                        folderCount={totalFolderCount}
                        importCount={totalImportCount}
                        secretRotationCount={totalSecretRotationCount}
                      />
                    }
                    count={totalCount}
                    page={page}
                    perPage={perPage}
                    onChangePage={(newPage) => setPage(newPage)}
                    onChangePerPage={handlePerPageChange}
                  />
                </>
              )
            }
          </UnstableCardContent>
        </UnstableCard>
      </div>
      <Sheet
        modal={false}
        open={popUp.addSecretsInAllEnvs.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("addSecretsInAllEnvs", isOpen)}
      >
        <SheetContent className="flex h-full flex-col gap-y-0 overflow-y-auto sm:max-w-lg">
          <SheetHeader className="border-b">
            <SheetTitle>Create Secret</SheetTitle>
            <SheetDescription>
              {filteredEnvs.length === 1
                ? `Create a secret in ${filteredEnvs[0].name}`
                : "Create a secret across multiple environments"}
            </SheetDescription>
          </SheetHeader>
          <CreateSecretForm
            secretPath={secretPath}
            defaultSelectedEnvs={filteredEnvs}
            onClose={() => handlePopUpClose("addSecretsInAllEnvs")}
            isBatchMode={isBatchModeActive}
            onBatchSecretCreate={(params) => {
              addPendingChange(
                {
                  id: crypto.randomUUID(),
                  resourceType: "secret",
                  type: PendingAction.Create,
                  secretKey: params.key,
                  secretValue: params.value,
                  secretComment: params.comment,
                  skipMultilineEncoding: params.skipMultilineEncoding ?? undefined,
                  tags: params.tags,
                  secretMetadata: params.metadata,
                  timestamp: Date.now()
                },
                { projectId, environment: params.env, secretPath }
              );
            }}
          />
        </SheetContent>
      </Sheet>
      <Modal
        isOpen={popUp.addFolder.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("addFolder", isOpen)}
      >
        <ModalContent title="Create Folder">
          <FolderForm onCreateFolder={handleFolderCreate} />
        </ModalContent>
      </Modal>
      <Modal
        isOpen={popUp.updateFolder.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("updateFolder", isOpen)}
      >
        <ModalContent title="Edit Folder Name">
          <FolderForm
            isEdit
            defaultFolderName={(popUp.updateFolder?.data as Pick<TSecretFolder, "name">)?.name}
            defaultDescription={
              (popUp.updateFolder?.data as Pick<TSecretFolder, "description">)?.description
            }
            onUpdateFolder={handleFolderUpdate}
            showDescriptionOverwriteWarning
          />
        </ModalContent>
      </Modal>
      <CreateDynamicSecretForm
        isOpen={popUp.addDynamicSecret.isOpen}
        onToggle={(isOpen) => handlePopUpToggle("addDynamicSecret", isOpen)}
        projectSlug={projectSlug}
        environments={userAvailableDynamicSecretEnvs}
        secretPath={secretPath}
      />
      <Modal
        isOpen={popUp.dynamicSecretLeases.isOpen}
        onOpenChange={(state) => handlePopUpToggle("dynamicSecretLeases", state)}
      >
        <ModalContent
          title={
            <div className="flex items-center space-x-2">
              <p>Dynamic secret leases</p>
              <Badge variant="neutral">{dynamicSecretLeaseData?.name}</Badge>
            </div>
          }
          subTitle="Revoke or renew your secret leases"
          className="max-w-3xl"
        >
          {dynamicSecretLeaseData && (
            <DynamicSecretLease
              dynamicSecret={dynamicSecretLeaseData}
              onClickNewLease={() =>
                handlePopUpOpen("createDynamicSecretLease", dynamicSecretLeaseData)
              }
              onClose={() => handlePopUpClose("dynamicSecretLeases")}
              projectSlug={projectSlug}
              key={dynamicSecretLeaseData.id}
              dynamicSecretName={dynamicSecretLeaseData.name}
              secretPath={secretPath}
              environment={dynamicSecretLeaseData.environment}
            />
          )}
        </ModalContent>
      </Modal>
      <Modal
        isOpen={popUp.editDynamicSecret.isOpen}
        onOpenChange={(state) => handlePopUpToggle("editDynamicSecret", state)}
      >
        <ModalContent title="Edit dynamic secret" className="max-w-3xl">
          <EditDynamicSecretForm
            onClose={() => handlePopUpClose("editDynamicSecret")}
            projectSlug={projectSlug}
            dynamicSecretName={
              (popUp.editDynamicSecret?.data as TDynamicSecret & { environment: string })?.name
            }
            secretPath={secretPath}
            environment={
              (popUp.editDynamicSecret?.data as TDynamicSecret & { environment: string })
                ?.environment
            }
          />
        </ModalContent>
      </Modal>
      <Modal
        isOpen={popUp.createDynamicSecretLease.isOpen}
        onOpenChange={(state) => handlePopUpToggle("createDynamicSecretLease", state)}
      >
        <ModalContent title="Provision lease">
          <CreateDynamicSecretLease
            provider={
              (popUp.createDynamicSecretLease?.data as TDynamicSecret & { environment: string })
                ?.type
            }
            onClose={() => handlePopUpClose("createDynamicSecretLease")}
            projectSlug={projectSlug}
            dynamicSecretName={
              (popUp.createDynamicSecretLease?.data as TDynamicSecret & { environment: string })
                ?.name
            }
            secretPath={secretPath}
            environment={
              (popUp.createDynamicSecretLease?.data as TDynamicSecret & { environment: string })
                ?.environment
            }
          />
        </ModalContent>
      </Modal>
      <DeleteActionModal
        isOpen={popUp.deleteDynamicSecret.isOpen}
        deleteKey={
          (popUp.deleteDynamicSecret?.data as TDynamicSecret & { environment: string })?.name
        }
        title={
          (popUp.deleteDynamicSecret?.data as { isForced?: boolean })?.isForced
            ? "Do you want to force delete this dynamic secret?"
            : "Do you want to delete this dynamic secret?"
        }
        onChange={(isOpen) => handlePopUpToggle("deleteDynamicSecret", isOpen)}
        onDeleteApproved={handleDynamicSecretDelete}
      />
      <AlertDialog
        open={popUp.deleteSecretImport.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("deleteSecretImport", isOpen)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <TrashIcon />
            </AlertDialogMedia>
            <AlertDialogTitle>Remove Secret Import</AlertDialogTitle>
            <AlertDialogDescription className="max-w-full overflow-hidden">
              This will unlink secrets imported from{" "}
              <span className="inline-block max-w-full truncate align-bottom text-foreground">
                {(popUp.deleteSecretImport?.data as TSecretImport)?.importEnv?.name}
              </span>
              . The source secrets will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="danger" onClick={handleSecretImportDelete}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <CreateSecretImportForm
        environment={singleEnvSlug}
        projectId={projectId}
        secretPath={secretPath}
        isOpen={popUp.addSecretImport.isOpen}
        onClose={() => {
          handlePopUpClose("addSecretImport");
        }}
        onTogglePopUp={(isOpen) => {
          if (!isOpen) {
            handlePopUpClose("addSecretImport");
          }
        }}
        onUpgradePlan={() =>
          handlePopUpOpen("upgradePlan", {
            text: "Secret import replication requires an upgraded plan."
          })
        }
      />
      {subscription && (
        <UpgradePlanModal
          isOpen={popUp.upgradePlan.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
          isEnterpriseFeature={popUp.upgradePlan.data?.isEnterpriseFeature}
          text={popUp.upgradePlan.data?.text}
        />
      )}
      <CreateSecretRotationV2Modal
        secretPath={secretPath}
        environments={userAvailableSecretRotationEnvs}
        isOpen={popUp.addSecretRotation.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("addSecretRotation", isOpen)}
      />
      <EditSecretRotationV2Modal
        isOpen={popUp.editSecretRotation.isOpen}
        secretRotation={popUp.editSecretRotation.data as TSecretRotationV2}
        onOpenChange={(isOpen) => handlePopUpToggle("editSecretRotation", isOpen)}
      />
      <RotateSecretRotationV2Modal
        isOpen={popUp.rotateSecretRotation.isOpen}
        secretRotation={popUp.rotateSecretRotation.data as TSecretRotationV2}
        onOpenChange={(isOpen) => handlePopUpToggle("rotateSecretRotation", isOpen)}
      />
      <ReconcileLocalAccountRotationModal
        isOpen={
          popUp.reconcileSecretRotation.isOpen &&
          ((popUp.reconcileSecretRotation.data as TSecretRotationV2)?.type ===
            SecretRotationV2.UnixLinuxLocalAccount ||
            (popUp.reconcileSecretRotation.data as TSecretRotationV2)?.type ===
              SecretRotationV2.WindowsLocalAccount ||
            (popUp.reconcileSecretRotation.data as TSecretRotationV2)?.type ===
              SecretRotationV2.HpIloLocalAccount)
        }
        secretRotation={popUp.reconcileSecretRotation.data as TSecretRotationV2}
        onOpenChange={(isOpen) => handlePopUpToggle("reconcileSecretRotation", isOpen)}
      />
      <ViewSecretRotationV2GeneratedCredentialsModal
        isOpen={popUp.viewSecretRotationGeneratedCredentials.isOpen}
        secretRotation={popUp.viewSecretRotationGeneratedCredentials.data as TSecretRotationV2}
        onOpenChange={(isOpen) =>
          handlePopUpToggle("viewSecretRotationGeneratedCredentials", isOpen)
        }
      />
      <DeleteSecretRotationV2Modal
        isOpen={popUp.deleteSecretRotation.isOpen}
        secretRotation={popUp.deleteSecretRotation.data as TSecretRotationV2}
        onOpenChange={(isOpen) => handlePopUpToggle("deleteSecretRotation", isOpen)}
      />
      <ImportSecretsModal
        isOpen={popUp.importSecrets.isOpen}
        onOpenChange={(isOpen) => {
          handlePopUpToggle("importSecrets", isOpen);
          if (!isOpen) setImportParsedSecrets(null);
        }}
        environments={userAvailableEnvs}
        projectId={projectId}
        secretPath={secretPath}
        initialParsedSecrets={importParsedSecrets}
      />
      <ReplicateFolderFromBoard
        isOpen={popUp.replicateFolder.isOpen}
        onToggle={(isOpen) => handlePopUpToggle("replicateFolder", isOpen)}
        onParsedEnv={handleParsedEnvMultiFolder}
        environment={singleVisibleEnv?.slug ?? ""}
        environments={userAvailableEnvs}
        projectId={projectId}
        secretPath={secretPath}
      />
      <Modal
        isOpen={popUp?.confirmReplicateUpload?.isOpen}
        onOpenChange={(open) => handlePopUpToggle("confirmReplicateUpload", open)}
      >
        <ModalContent
          title="Confirm Secret Upload"
          footerContent={[
            <ButtonV2
              isLoading={isReplicateSubmitting}
              isDisabled={isReplicateSubmitting}
              colorSchema={isReplicateNonConflicting ? "primary" : "danger"}
              key="overwrite-btn"
              onClick={handleSaveReplicateImport}
            >
              {isReplicateNonConflicting ? "Upload" : "Overwrite"}
            </ButtonV2>,
            <ButtonV2
              key="keep-old-btn"
              className="ml-4"
              onClick={() => handlePopUpClose("confirmReplicateUpload")}
              variant="outline_bg"
              isDisabled={isReplicateSubmitting}
            >
              Cancel
            </ButtonV2>
          ]}
        >
          {isReplicateNonConflicting ? (
            <div>
              Are you sure you want to import {replicateCreateCount} secret
              {replicateCreateCount > 1 ? "s" : ""} to this environment?
            </div>
          ) : (
            <div className="flex flex-col text-gray-300">
              <div>Your project already contains the following {replicateUpdateCount} secrets:</div>
              <div className="mt-2 text-sm text-gray-400">
                {(popUp?.confirmReplicateUpload?.data as TSecOverwriteOpt)?.update
                  ?.map((sec) => sec.secretKey)
                  .join(", ")}
              </div>
              <div className="mt-6">
                Are you sure you want to overwrite these secrets
                {replicateCreateCount > 0
                  ? ` and import ${replicateCreateCount} new
                one${replicateCreateCount > 1 ? "s" : ""}`
                  : ""}
                ?
              </div>
            </div>
          )}
        </ModalContent>
      </Modal>
      <VaultSecretImportModal
        isOpen={popUp.importFromVault.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("importFromVault", isOpen)}
        environment={singleEnvSlug}
        secretPath={secretPath}
        onImport={handleVaultImport}
      />
      <AlertDialog
        open={popUp.deleteFolder.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("deleteFolder", isOpen)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <TrashIcon />
            </AlertDialogMedia>
            <AlertDialogTitle>Delete Folder</AlertDialogTitle>
            <AlertDialogDescription>
              {subscription?.pitRecovery
                ? "This folder and all its contents will be removed. You can reverse this action by rolling back to a previous commit."
                : "This folder and all its contents will be removed. Rolling back to a previous commit isn't available on your current plan. Upgrade to enable this feature."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="danger" onClick={handleFolderDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={popUp.deleteEnv.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("deleteEnv", isOpen)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <TrashIcon />
            </AlertDialogMedia>
            <AlertDialogTitle>Delete Environment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-medium text-foreground">
                {(popUp?.deleteEnv?.data as { name: string })?.name}
              </span>
              ? This action is irreversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="danger" onClick={handleDeleteEnvironment}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {!!pathPolicies && pathPolicies.length > 0 && (
        <RequestAccessModal
          policies={pathPolicies}
          isOpen={popUp.requestAccess.isOpen}
          onOpenChange={() => {
            handlePopUpClose("requestAccess");
          }}
          selectedActions={popUp.requestAccess.data as ProjectPermissionActions[] | undefined}
          secretPath={pathPolicies[0].secretPath}
        />
      )}
      {isBatchModeActive && singleVisibleEnv && (
        <CommitForm
          onCommit={handleCreateCommit}
          environment={singleVisibleEnv.slug}
          projectId={projectId}
          secretPath={secretPath}
          isCommitting={isCommitPending}
          isReviewOpen={isReviewOpen}
          onReviewOpenChange={setIsReviewOpen}
        />
      )}
      <AlertDialog
        open={popUp.confirmDisableBatchMode.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("confirmDisableBatchMode", isOpen)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <LayersIcon />
            </AlertDialogMedia>
            <AlertDialogTitle>Disable Batch Mode</AlertDialogTitle>
            <AlertDialogDescription>
              You have pending changes that will be discarded. Are you sure you want to disable
              batch mode?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="danger" onClick={handleConfirmDisableBatchMode}>
              Discard & Disable
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export const OverviewPage = () => (
  <StoreProvider>
    <OverviewPageContent />
  </StoreProvider>
);
