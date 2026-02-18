import { SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { subject } from "@casl/ability";
import { DragDropProvider, DragEndEvent, DragOverlay } from "@dnd-kit/react";
import { isSortable } from "@dnd-kit/react/sortable";
import { arrayMove } from "@dnd-kit/sortable";
import { useNavigate, useParams, useRouter, useSearch } from "@tanstack/react-router";
import { AxiosError } from "axios";
import {
  ChevronDownIcon,
  CopyIcon,
  DownloadIcon,
  GitCommitIcon,
  LogInIcon,
  SettingsIcon,
  TrashIcon
} from "lucide-react";
import { twMerge } from "tailwind-merge";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { CreateSecretRotationV2Modal } from "@app/components/secret-rotations-v2";
import { DeleteSecretRotationV2Modal } from "@app/components/secret-rotations-v2/DeleteSecretRotationV2Modal";
import { EditSecretRotationV2Modal } from "@app/components/secret-rotations-v2/EditSecretRotationV2Modal";
import { ReconcileLocalAccountRotationModal } from "@app/components/secret-rotations-v2/ReconcileLocalAccountRotationModal";
import { RotateSecretRotationV2Modal } from "@app/components/secret-rotations-v2/RotateSecretRotationV2Modal";
import { ViewSecretRotationV2GeneratedCredentialsModal } from "@app/components/secret-rotations-v2/ViewSecretRotationV2GeneratedCredentials";
import { DeleteActionModal, Modal, ModalContent, PageHeader } from "@app/components/v2";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  FilterableSelect,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
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
  useResetPageHelper
} from "@app/hooks";
import {
  useCreateFolder,
  useCreateSecretV3,
  useDeleteDynamicSecret,
  useDeleteFolder,
  useDeleteSecretImport,
  useDeleteSecretV3,
  useGetImportedSecretsAllEnvs,
  useGetOrCreateFolder,
  useGetWsTags,
  useUpdateSecretImport,
  useUpdateSecretV3
} from "@app/hooks/api";
import { useGetProjectSecretsOverview } from "@app/hooks/api/dashboard/queries";
import { DashboardSecretsOrderBy, ProjectSecretsImportedBy } from "@app/hooks/api/dashboard/types";
import { TDynamicSecret } from "@app/hooks/api/dynamicSecret/types";
import { useGetFolderCommitsCount } from "@app/hooks/api/folderCommits";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { ProjectType, ProjectVersion } from "@app/hooks/api/projects/types";
import { useUpdateFolderBatch } from "@app/hooks/api/secretFolders/queries";
import { TUpdateFolderBatchDTO } from "@app/hooks/api/secretFolders/types";
import { TSecretImport } from "@app/hooks/api/secretImports/types";
import {
  SecretRotation as SecretRotationV2,
  TSecretRotationV2
} from "@app/hooks/api/secretRotationsV2";
import { fetchProjectSecrets } from "@app/hooks/api/secrets/queries";
import {
  ApiErrorTypes,
  ProjectEnv,
  SecretType,
  SecretV3RawSanitized,
  TApiErrors,
  TSecretFolder
} from "@app/hooks/api/types";
import {
  useDynamicSecretOverview,
  useFolderOverview,
  useSecretImportOverview,
  useSecretOverview,
  useSecretRotationOverview
} from "@app/hooks/utils";

import { CreateDynamicSecretForm } from "../SecretDashboardPage/components/ActionBar/CreateDynamicSecretForm";
import { CreateSecretImportForm } from "../SecretDashboardPage/components/ActionBar/CreateSecretImportForm";
import { FolderForm } from "../SecretDashboardPage/components/ActionBar/FolderForm";
import { CreateDynamicSecretLease } from "../SecretDashboardPage/components/DynamicSecretListView/CreateDynamicSecretLease";
import { EditDynamicSecretForm } from "../SecretDashboardPage/components/DynamicSecretListView/EditDynamicSecretForm";
import {
  HIDDEN_SECRET_VALUE,
  HIDDEN_SECRET_VALUE_API_MASK
} from "../SecretDashboardPage/components/SecretListView/SecretItem";
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

export const OverviewPage = () => {
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
      environments: el.environments
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
  const prevPageSize = useRef(0);

  const canReadCommits = permission.can(
    ProjectPermissionCommitsActions.Read,
    ProjectPermissionSub.Commits
  );

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
    []
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

  const { mutateAsync: createSecretV3 } = useCreateSecretV3();
  const { mutateAsync: updateSecretV3 } = useUpdateSecretV3();
  const { mutateAsync: deleteSecretV3 } = useDeleteSecretV3();
  const { mutateAsync: createFolder } = useCreateFolder();
  const { mutateAsync: deleteFolder } = useDeleteFolder();
  const { mutateAsync: getOrCreateFolder } = useGetOrCreateFolder();
  const { mutateAsync: updateFolderBatch } = useUpdateFolderBatch();
  const deleteDynamicSecret = useDeleteDynamicSecret();
  const { mutateAsync: deleteSecretImport } = useDeleteSecretImport();
  const { mutate: updateSecretImport } = useUpdateSecretImport();

  const isSingleEnvView = visibleEnvs.length === 1;
  const singleEnvSlug = isSingleEnvView ? visibleEnvs[0].slug : "";
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

  const [secretImportEnv, setSecretImportEnv] = useState<string>("");

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
    "createDynamicSecretLease",
    "deleteDynamicSecret",
    "snapshots",
    "deleteSecretImport",
    "addSecretImport"
  ] as const);

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
    if (isSingleEnvView) {
      setSecretImportEnv(singleEnvSlug);
    } else if (userAvailableSecretImportEnvs.length === 1) {
      setSecretImportEnv(userAvailableSecretImportEnvs[0].slug);
    } else {
      setSecretImportEnv("");
    }
    handlePopUpOpen("addSecretImport");
  };

  const handleFolderCreate = async (folderName: string, description: string | null) => {
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

  const handleFolderUpdate = async (newFolderName: string, description: string | null) => {
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
    if (!secretImportData) return;
    try {
      await deleteSecretImport({
        projectId,
        environment: secretImportData.environment!,
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

  const handleSecretImportReorder: DragEndEvent = (event) => {
    if (event.canceled) return;
    const { source } = event.operation;
    if (!source || !isSortable(source)) return;

    const oldIndex = source.sortable.initialIndex;
    const newIndex = source.sortable.index;
    if (oldIndex === newIndex) return;

    const newImportOrder = arrayMove(sortableImportItems, oldIndex, newIndex);
    setSortableImportItems(newImportOrder);
    updateSecretImport({
      projectId,
      environment: singleEnvSlug,
      path: secretPath,
      id: source.id as string,
      import: {
        position: newIndex + 1
      }
    });
  };

  const handleSecretCreate = async (
    env: string,
    key: string,
    value: string,
    type = SecretType.Shared
  ) => {
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

  const handleSecretUpdate = async (
    env: string,
    key: string,
    value: string | undefined,
    secretValueHidden: boolean,
    type = SecretType.Shared,
    _secretId?: string,
    newSecretName?: string
  ) => {
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

  const handleExploreEnvClick = async (slug: string) => {
    if (secretPath !== "/") {
      const pathSegment = secretPath.split("/").filter(Boolean);
      const parentPath = `/${pathSegment.slice(0, -1).join("/")}`;
      const folderName = pathSegment.at(-1);
      const canCreateFolder = permission.can(
        ProjectPermissionActions.Create,
        subject(ProjectPermissionSub.SecretFolders, {
          environment: slug,
          secretPath: parentPath
        })
      );
      if (folderName && parentPath && canCreateFolder) {
        await getOrCreateFolder({
          projectId,
          environment: slug,
          path: parentPath,
          name: folderName
        });
      }
    }

    const query: Record<string, string | string[]> = { ...routerSearch, search: searchFilter };
    const envIndex = visibleEnvs.findIndex((el) => slug === el.slug);
    if (envIndex !== -1) {
      navigate({
        to: "/organizations/$orgId/projects/secret-management/$projectId/secrets/$envSlug",
        params: {
          orgId,
          projectId,
          envSlug: slug
        },
        search: query
      });
    }
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

  useEffect(() => {
    if (routerSearch.search) {
      const { search, ...query } = routerSearch;
      // temp workaround until we transition state to query params
      navigate({
        search: query
      });
      setFilter(DEFAULT_FILTER_STATE);
      setSearchFilter(routerSearch.search as string);
      setDebouncedSearchFilter(routerSearch.search as string);
    }
  }, [routerSearch.search]);

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

  const isTableEmpty = totalCount === 0 && !isOverviewLoading;

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
  return (
    <div className="">
      <Helmet>
        <title>{t("common.head-title", { title: t("dashboard.title") })}</title>
        <meta property="og:title" content={String(t("dashboard.og-title"))} />
        <meta name="og:description" content={String(t("dashboard.og-description"))} />
      </Helmet>
      <div className="relative mx-auto max-w-8xl text-mineshaft-50 dark:scheme-dark">
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
                  href="https://infisical.com/docs/documentation/getting-started/api"
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
        />
        <UnstableCard>
          <UnstableCardHeader>
            <div className="flex flex-col gap-3 overflow-hidden dashboard:flex-row dashboard:items-center">
              <div className="flex flex-1 items-center gap-x-3 overflow-hidden whitespace-nowrap dashboard:mr-auto">
                <EnvironmentSelect selectedEnvs={filteredEnvs} setSelectedEnvs={setFilteredEnvs} />
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
                    isDyanmicSecretAvailable={userAvailableDynamicSecretEnvs.length > 0}
                    isSecretRotationAvailable={userAvailableSecretRotationEnvs.length > 0}
                    onAddSecretImport={handleAddSecretImport}
                    isSecretImportAvailable={userAvailableSecretImportEnvs.length > 0}
                  />
                )}
              </div>
            </div>
          </UnstableCardHeader>
          <UnstableCardContent>
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
                  <SecretDropzone
                    onParsedSecrets={(env) => {
                      setImportParsedSecrets(env);
                      handlePopUpOpen("importSecrets");
                    }}
                    onAddSecret={() => handlePopUpOpen("addSecretsInAllEnvs")}
                  />
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
                              isDisabled={totalCount === 0}
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
                            visibleEnvs?.map(({ name, slug }, index) => {
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
                                        onClick={() => handleExploreEnvClick(slug)}
                                      >
                                        <LogInIcon />
                                        Explore Environment
                                      </UnstableDropdownMenuItem>
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
                                    </UnstableDropdownMenuContent>
                                  </UnstableDropdownMenu>
                                </UnstableTableHead>
                              );
                            })
                          ) : (
                            <UnstableTableHead className="w-full">
                              <div className="flex w-full items-center justify-between">
                                Value
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
                            {folderNamesAndDescriptions.map(
                              ({ name: folderName, description }, index) => (
                                <FolderTableRow
                                  folderName={folderName}
                                  description={description}
                                  isFolderPresentInEnv={isFolderPresentInEnv}
                                  isSelected={Boolean(selectedEntries.folder[folderName])}
                                  onToggleFolderSelect={() =>
                                    toggleSelectedEntry(EntryType.FOLDER, folderName)
                                  }
                                  environments={visibleEnvs}
                                  key={`overview-${folderName}-${index + 1}`}
                                  onClick={handleFolderClick}
                                  onToggleFolderEdit={(name: string) =>
                                    handlePopUpOpen("updateFolder", { name, description })
                                  }
                                  onToggleFolderDelete={(name: string) =>
                                    handlePopUpOpen("deleteFolder", { name })
                                  }
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
                            {secKeys.map((key, index) => (
                              <SecretTableRow
                                isSelected={Boolean(selectedEntries.secret[key])}
                                onToggleSecretSelect={() =>
                                  toggleSelectedEntry(EntryType.SECRET, key)
                                }
                                secretPath={secretPath}
                                getImportedSecretByKey={getImportedSecretByKey}
                                isImportedSecretPresentInEnv={handleIsImportedSecretPresentInEnv}
                                onSecretCreate={handleSecretCreate}
                                onSecretDelete={handleSecretDelete}
                                onSecretUpdate={handleSecretUpdate}
                                key={`overview-${key}-${index + 1}`}
                                environments={visibleEnvs}
                                secretKey={key}
                                getSecretByKey={getSecretByKey}
                                tableWidth={tableWidth}
                                importedBy={importedBy}
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
                            {visibleEnvs.length > 1 && (
                              <UnstableTableRow className="hover:bg-container">
                                <UnstableTableCell className="sticky left-0 z-10 bg-container" />
                                <UnstableTableCell className="sticky left-10 z-10 border-r bg-container" />
                                {visibleEnvs?.map(({ slug }) => (
                                  <UnstableTableCell
                                    className="border-r last:border-r-0"
                                    key={`explore-${slug}`}
                                  >
                                    <Button
                                      onClick={() => handleExploreEnvClick(slug)}
                                      isFullWidth
                                      variant="project"
                                      size="xs"
                                    >
                                      Explore <LogInIcon />
                                    </Button>
                                  </UnstableTableCell>
                                ))}
                              </UnstableTableRow>
                            )}
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
      <Modal
        isOpen={popUp.addSecretsInAllEnvs.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("addSecretsInAllEnvs", isOpen)}
      >
        <ModalContent
          className="max-h-[80vh]"
          bodyClassName="overflow-visible"
          title="Create Secrets"
          subTitle="Create a secret across multiple environments"
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <CreateSecretForm
            secretPath={secretPath}
            onClose={() => handlePopUpClose("addSecretsInAllEnvs")}
          />
        </ModalContent>
      </Modal>
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
      <Dialog
        open={popUp.addSecretImport.isOpen && !secretImportEnv}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            handlePopUpClose("addSecretImport");
            setSecretImportEnv("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Select Environment</DialogTitle>
            <DialogDescription>
              Choose the environment to add the secret import to.
            </DialogDescription>
          </DialogHeader>
          <FilterableSelect
            options={userAvailableSecretImportEnvs}
            getOptionLabel={(option) => option.name}
            getOptionValue={(option) => option.slug}
            placeholder="Select environment..."
            onChange={(option) => {
              if (option) setSecretImportEnv((option as { slug: string }).slug);
            }}
          />
        </DialogContent>
      </Dialog>
      <CreateSecretImportForm
        environment={secretImportEnv}
        projectId={projectId}
        secretPath={secretPath}
        isOpen={popUp.addSecretImport.isOpen && Boolean(secretImportEnv)}
        onClose={() => {
          handlePopUpClose("addSecretImport");
          setSecretImportEnv("");
        }}
        onTogglePopUp={(isOpen) => {
          if (!isOpen) {
            handlePopUpClose("addSecretImport");
            setSecretImportEnv("");
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
              SecretRotationV2.WindowsLocalAccount)
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
    </div>
  );
};
