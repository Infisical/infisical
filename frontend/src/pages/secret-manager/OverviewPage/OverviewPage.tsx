import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { subject } from "@casl/ability";
import { faCheckCircle } from "@fortawesome/free-regular-svg-icons";
import {
  faAngleDown,
  faArrowDown,
  faArrowLeft,
  faArrowRight,
  faArrowRightToBracket,
  faArrowUp,
  faCheck,
  faCopy,
  faFilter,
  faFingerprint,
  faFolder,
  faFolderBlank,
  faFolderPlus,
  faKey,
  faPlus,
  faRotate
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, useNavigate, useParams, useRouter, useSearch } from "@tanstack/react-router";
import { twMerge } from "tailwind-merge";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { CreateSecretRotationV2Modal } from "@app/components/secret-rotations-v2";
import { DeleteSecretRotationV2Modal } from "@app/components/secret-rotations-v2/DeleteSecretRotationV2Modal";
import { EditSecretRotationV2Modal } from "@app/components/secret-rotations-v2/EditSecretRotationV2Modal";
import { RotateSecretRotationV2Modal } from "@app/components/secret-rotations-v2/RotateSecretRotationV2Modal";
import { ViewSecretRotationV2GeneratedCredentialsModal } from "@app/components/secret-rotations-v2/ViewSecretRotationV2GeneratedCredentials";
import {
  Button,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  EmptyState,
  IconButton,
  Lottie,
  Modal,
  ModalContent,
  PageHeader,
  Pagination,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  TFoot,
  Th,
  THead,
  Tooltip,
  Tr
} from "@app/components/v2";
import { HeaderResizer } from "@app/components/v2/HeaderResizer/HeaderResizer";
import { ROUTE_PATHS } from "@app/const/routes";
import {
  ProjectPermissionActions,
  ProjectPermissionDynamicSecretActions,
  ProjectPermissionSub,
  useProject,
  useProjectPermission,
  useSubscription
} from "@app/context";
import { ProjectPermissionSecretRotationActions } from "@app/context/ProjectPermissionContext/types";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import {
  useDebounce,
  usePagination,
  usePopUp,
  useResetPageHelper,
  useResizableHeaderHeight,
  useTimedReset,
  useToggle
} from "@app/hooks";
import {
  useCreateFolder,
  useCreateSecretV3,
  useDeleteSecretV3,
  useGetImportedSecretsAllEnvs,
  useGetOrCreateFolder,
  useGetWsTags,
  useUpdateSecretV3
} from "@app/hooks/api";
import { useGetProjectSecretsOverview } from "@app/hooks/api/dashboard/queries";
import { DashboardSecretsOrderBy, ProjectSecretsImportedBy } from "@app/hooks/api/dashboard/types";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { ProjectType, ProjectVersion } from "@app/hooks/api/projects/types";
import { useUpdateFolderBatch } from "@app/hooks/api/secretFolders/queries";
import { TUpdateFolderBatchDTO } from "@app/hooks/api/secretFolders/types";
import { TSecretRotationV2 } from "@app/hooks/api/secretRotationsV2";
import { ProjectEnv, SecretType, SecretV3RawSanitized, TSecretFolder } from "@app/hooks/api/types";
import {
  useDynamicSecretOverview,
  useFolderOverview,
  useSecretOverview,
  useSecretRotationOverview
} from "@app/hooks/utils";
import { SecretOverviewSecretRotationRow } from "@app/pages/secret-manager/OverviewPage/components/SecretOverviewSecretRotationRow";
import { getHeaderStyle } from "@app/pages/secret-manager/OverviewPage/components/utils";

import { CreateDynamicSecretForm } from "../SecretDashboardPage/components/ActionBar/CreateDynamicSecretForm";
import { FolderForm } from "../SecretDashboardPage/components/ActionBar/FolderForm";
import {
  HIDDEN_SECRET_VALUE,
  HIDDEN_SECRET_VALUE_API_MASK
} from "../SecretDashboardPage/components/SecretListView/SecretItem";
import { CreateSecretForm } from "./components/CreateSecretForm";
import { FolderBreadCrumbs } from "./components/FolderBreadCrumbs";
import { SecretOverviewDynamicSecretRow } from "./components/SecretOverviewDynamicSecretRow";
import { SecretOverviewFolderRow } from "./components/SecretOverviewFolderRow";
import {
  SecretNoAccessOverviewTableRow,
  SecretOverviewTableRow
} from "./components/SecretOverviewTableRow";
import { SecretSearchInput } from "./components/SecretSearchInput";
import { SecretTableResourceCount } from "./components/SecretTableResourceCount";
import { SecretV2MigrationSection } from "./components/SecretV2MigrationSection";
import { SelectionPanel } from "./components/SelectionPanel/SelectionPanel";

export enum EntryType {
  FOLDER = "folder",
  SECRET = "secret"
}

enum RowType {
  Folder = "folder",
  DynamicSecret = "dynamic",
  Secret = "secret",
  SecretRotation = "rotation"
}

type Filter = {
  [key in RowType]: boolean;
};

const DEFAULT_FILTER_STATE = {
  [RowType.Folder]: false,
  [RowType.DynamicSecret]: false,
  [RowType.Secret]: false,
  [RowType.SecretRotation]: false
};

const DEFAULT_COLLAPSED_HEADER_HEIGHT = 120;

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
      search: el.search
    })
  });

  const orgId = useParams({
    from: ROUTE_PATHS.SecretManager.OverviewPage.id,
    select: (el) => el.orgId
  });
  const [scrollOffset, setScrollOffset] = useState(0);
  const [debouncedScrollOffset] = useDebounce(scrollOffset);
  const { permission } = useProjectPermission();
  const tableRef = useRef<HTMLDivElement>(null);
  const { currentProject, projectId } = useProject();
  const isProjectV3 = currentProject?.version === ProjectVersion.V3;
  const projectSlug = currentProject?.slug as string;
  const [searchFilter, setSearchFilter] = useState("");
  const [debouncedSearchFilter, setDebouncedSearchFilter] = useDebounce(searchFilter);
  const secretPath = (routerSearch?.secretPath as string) || "/";
  const { subscription } = useSubscription();
  const [collapseEnvironments, setCollapseEnvironments] = useToggle(
    Boolean(localStorage.getItem("overview-collapse-environments"))
  );

  const handleToggleNarrowHeader = () => {
    setCollapseEnvironments.toggle();
    if (collapseEnvironments) {
      localStorage.removeItem("overview-collapse-environments");
    } else {
      localStorage.setItem("overview-collapse-environments", "true");
    }
  };

  const [isCopied, , setIsCopied] = useTimedReset<boolean>({
    initialState: false
  });

  const copyToClipboard = (value: string) => {
    navigator.clipboard.writeText(value);
    setIsCopied(true);
  };

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

  const [filteredEnvs, setFilteredEnvs] = useState<ProjectEnv[]>([]);
  const visibleEnvs = filteredEnvs.length ? filteredEnvs : userAvailableEnvs;

  const {
    secretImports,
    isImportedSecretPresentInEnv,
    getImportedSecretByKey,
    getEnvImportedSecretKeyCount
  } = useGetImportedSecretsAllEnvs({
    projectId,
    path: secretPath,
    environments: (userAvailableEnvs || []).map(({ slug }) => slug)
  });

  const isFilteredByResources = Object.values(filter).some(Boolean);
  const {
    isPending: isOverviewLoading,
    data: overview,
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
      includeImports: true,
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

  const { dynamicSecretNames, isDynamicSecretPresentInEnv } =
    useDynamicSecretOverview(dynamicSecrets);

  const {
    secretRotationNames,
    isSecretRotationPresentInEnv,
    getSecretRotationByName,
    getSecretRotationStatusesByName
  } = useSecretRotationOverview(secretRotations);

  const { secKeys, getEnvSecretKeyCount } = useSecretOverview(secrets || []);

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
  const { mutateAsync: getOrCreateFolder } = useGetOrCreateFolder();
  const { mutateAsync: updateFolderBatch } = useUpdateFolderBatch();

  const { handlePopUpOpen, handlePopUpToggle, handlePopUpClose, popUp } = usePopUp([
    "addSecretsInAllEnvs",
    "addFolder",
    "misc",
    "updateFolder",
    "addDynamicSecret",
    "addSecretRotation",
    "editSecretRotation",
    "rotateSecretRotation",
    "viewSecretRotationGeneratedCredentials",
    "deleteSecretRotation",
    "upgradePlan"
  ] as const);

  const handleFolderCreate = async (folderName: string, description: string | null) => {
    const promises = userAvailableEnvs
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

  const handleSecretCreate = async (env: string, key: string, value: string) => {
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
      type: SecretType.Shared
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

  const handleEnvSelect = (envId: string) => {
    if (filteredEnvs.map((env) => env.id).includes(envId)) {
      setFilteredEnvs(filteredEnvs.filter((env) => env.id !== envId));
    } else {
      setFilteredEnvs(filteredEnvs.concat(userAvailableEnvs.filter((env) => env.id === envId)));
    }
  };

  const handleSecretUpdate = async (
    env: string,
    key: string,
    value: string,
    secretValueHidden: boolean,
    type = SecretType.Shared
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
        text: "Successfully updated secret"
      });
    }
  };

  const handleSecretDelete = async (env: string, key: string, secretId?: string) => {
    const result = await deleteSecretV3({
      environment: env,
      projectId,
      secretPath,
      secretKey: key,
      secretId,
      type: SecretType.Shared
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

    const query: Record<string, string> = { ...routerSearch, search: searchFilter };
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
        // bulk actions don't apply to rotation secrets (move/delete)
        if (secret.isRotatedSecret) return;

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

  const storedHeight = Number.parseInt(
    localStorage.getItem("overview-header-height") ?? DEFAULT_COLLAPSED_HEADER_HEIGHT.toString(),
    10
  );
  const { headerHeight, handleMouseDown, isResizing } = useResizableHeaderHeight({
    initialHeight: Number.isNaN(storedHeight) ? DEFAULT_COLLAPSED_HEADER_HEIGHT : storedHeight,
    minHeight: DEFAULT_COLLAPSED_HEADER_HEIGHT,
    maxHeight: 288
  });

  const debouncedHeaderHeight = useDebounce(headerHeight);

  useEffect(() => {
    localStorage.setItem("overview-header-height", debouncedHeaderHeight.toString());
  }, [debouncedHeaderHeight]);

  if (isProjectV3 && visibleEnvs.length > 0 && isOverviewLoading) {
    return (
      <div className="container mx-auto flex h-screen w-full items-center justify-center px-8 text-mineshaft-50 dark:scheme-dark">
        <Lottie isAutoPlay icon="infisical_loading" className="h-32 w-32" />
      </div>
    );
  }

  const canViewOverviewPage = Boolean(userAvailableEnvs.length);
  // This is needed to also show imports from other paths – right now those are missing.
  // const combinedKeys = [...secKeys, ...secretImports.map((impSecrets) => impSecrets?.data?.map((impSec) => impSec.secrets?.map((impSecKey) => impSecKey.key))).flat().flat()];

  const isTableEmpty = totalCount === 0;

  const isTableFiltered = isFilteredByResources || filteredEnvs.length > 0;

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
            title="Overview"
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
                . Click the Explore button to view the secret details section.
              </p>
            }
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <FolderBreadCrumbs secretPath={secretPath} onResetSearch={handleResetSearch} />
          <div className="flex flex-row flex-wrap items-center gap-2">
            {isTableFiltered && (
              <Button
                variant="plain"
                colorSchema="secondary"
                onClick={() => {
                  setFilteredEnvs([]);
                  setFilter(DEFAULT_FILTER_STATE);
                }}
              >
                Clear Filters
              </Button>
            )}
            {userAvailableEnvs.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline_bg"
                    className={twMerge(
                      "flex h-10",
                      isTableFiltered && "border-primary/40 bg-primary/10"
                    )}
                    leftIcon={
                      <FontAwesomeIcon
                        icon={faFilter}
                        className={isTableFiltered ? "text-primary/80" : undefined}
                      />
                    }
                  >
                    Filters
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="max-h-[70vh] thin-scrollbar overflow-y-auto"
                  align="end"
                  sideOffset={2}
                >
                  {/* <DropdownMenuItem className="px-1.5" asChild>
                    <Button
                      size="xs"
                      className="w-full"
                      colorSchema="primary"
                      variant="outline_bg"
                      leftIcon={<FontAwesomeIcon icon={faHockeyPuck} />}
                      // onClick={onCreateTag}
                    >
                      Create an environment
                    </Button>
                  </DropdownMenuItem> */}
                  <DropdownMenuLabel>Filter by Resource</DropdownMenuLabel>

                  <DropdownMenuItem
                    onClick={(e) => {
                      e.preventDefault();
                      handleToggleRowType(RowType.Folder);
                    }}
                    icon={filter[RowType.Folder] && <FontAwesomeIcon icon={faCheckCircle} />}
                    iconPos="right"
                  >
                    <div className="flex items-center gap-2">
                      <FontAwesomeIcon icon={faFolder} className="text-yellow-700" />
                      <span>Folders</span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.preventDefault();
                      handleToggleRowType(RowType.DynamicSecret);
                    }}
                    icon={filter[RowType.DynamicSecret] && <FontAwesomeIcon icon={faCheckCircle} />}
                    iconPos="right"
                  >
                    <div className="flex items-center gap-2">
                      <FontAwesomeIcon icon={faFingerprint} className="text-yellow-700" />
                      <span>Dynamic Secrets</span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.preventDefault();
                      handleToggleRowType(RowType.SecretRotation);
                    }}
                    icon={
                      filter[RowType.SecretRotation] && <FontAwesomeIcon icon={faCheckCircle} />
                    }
                    iconPos="right"
                  >
                    <div className="flex items-center gap-2">
                      <FontAwesomeIcon icon={faRotate} className="text-mineshaft-400" />
                      <span>Secret Rotations</span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.preventDefault();
                      handleToggleRowType(RowType.Secret);
                    }}
                    icon={filter[RowType.Secret] && <FontAwesomeIcon icon={faCheckCircle} />}
                    iconPos="right"
                  >
                    <div className="flex items-center gap-2">
                      <FontAwesomeIcon icon={faKey} className="text-bunker-300" />
                      <span>Secrets</span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuLabel>Filter by Environment</DropdownMenuLabel>
                  {userAvailableEnvs.map((availableEnv) => {
                    const { id: envId, name } = availableEnv;

                    const isEnvSelected = filteredEnvs.map((env) => env.id).includes(envId);
                    return (
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.preventDefault();
                          handleEnvSelect(envId);
                        }}
                        key={envId}
                        icon={isEnvSelected && <FontAwesomeIcon icon={faCheckCircle} />}
                        iconPos="right"
                      >
                        <div className="flex items-center">{name}</div>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <SecretSearchInput
              value={searchFilter}
              tags={tags}
              onChange={setSearchFilter}
              environments={userAvailableEnvs}
              projectId={currentProject?.id}
            />
            {userAvailableEnvs.length > 0 && (
              <div>
                <Button
                  variant="outline_bg"
                  leftIcon={<FontAwesomeIcon icon={faPlus} />}
                  onClick={() => handlePopUpOpen("addSecretsInAllEnvs")}
                  className="h-10 rounded-r-none"
                >
                  Add Secret
                </Button>
                <DropdownMenu
                  open={popUp.misc.isOpen}
                  onOpenChange={(isOpen) => handlePopUpToggle("misc", isOpen)}
                >
                  <DropdownMenuTrigger asChild>
                    <IconButton
                      ariaLabel="add-folder-or-import"
                      variant="outline_bg"
                      className="rounded-l-none bg-mineshaft-600 p-3"
                    >
                      <FontAwesomeIcon icon={faAngleDown} />
                    </IconButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <div className="flex flex-col space-y-1 p-1.5">
                      <ProjectPermissionCan
                        I={ProjectPermissionActions.Create}
                        a={ProjectPermissionSub.SecretFolders}
                      >
                        {(isAllowed) => (
                          <Button
                            leftIcon={<FontAwesomeIcon icon={faFolderPlus} className="pr-2" />}
                            onClick={() => {
                              handlePopUpOpen("addFolder");
                              handlePopUpClose("misc");
                            }}
                            isDisabled={!isAllowed}
                            variant="outline_bg"
                            className="h-10 text-left"
                            isFullWidth
                          >
                            Add Folder
                          </Button>
                        )}
                      </ProjectPermissionCan>
                      <Tooltip
                        content={
                          userAvailableDynamicSecretEnvs.length === 0 ? "Access restricted" : ""
                        }
                      >
                        <Button
                          leftIcon={<FontAwesomeIcon icon={faFingerprint} className="pr-2" />}
                          onClick={() => {
                            if (subscription?.dynamicSecret) {
                              handlePopUpOpen("addDynamicSecret");
                              handlePopUpClose("misc");
                              return;
                            }
                            handlePopUpOpen("upgradePlan", {
                              isEnterpriseFeature: true,
                              text: "Adding dynamic secrets can be unlocked if you upgrade to Infisical Enterprise plan."
                            });
                          }}
                          isDisabled={userAvailableDynamicSecretEnvs.length === 0}
                          variant="outline_bg"
                          className="h-10 text-left"
                          isFullWidth
                        >
                          Add Dynamic Secret
                        </Button>
                      </Tooltip>
                      <Tooltip
                        content={
                          userAvailableSecretRotationEnvs.length === 0 ? "Access restricted" : ""
                        }
                      >
                        <Button
                          leftIcon={<FontAwesomeIcon icon={faRotate} className="pr-2" />}
                          onClick={() => {
                            if (subscription?.secretRotation) {
                              handlePopUpOpen("addSecretRotation");
                              handlePopUpClose("misc");
                              return;
                            }
                            handlePopUpOpen("upgradePlan", {
                              text: "Adding secret rotations can be unlocked if you upgrade to Infisical Pro plan."
                            });
                          }}
                          isDisabled={userAvailableSecretRotationEnvs.length === 0}
                          variant="outline_bg"
                          className="h-10 text-left"
                          isFullWidth
                        >
                          Add Secret Rotation
                        </Button>
                      </Tooltip>
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>
        </div>
        <SelectionPanel
          secretPath={secretPath}
          selectedEntries={selectedEntries}
          resetSelectedEntries={resetSelectedEntries}
          importedBy={importedBy}
          secretsToDeleteKeys={secretsToDeleteKeys}
          usedBySecretSyncs={usedBySecretSyncs}
        />
        <div ref={tableRef} className="mt-4">
          <TableContainer
            onScroll={(e) => setScrollOffset(e.currentTarget.scrollLeft)}
            className="max-h-[66vh] thin-scrollbar overflow-y-auto rounded-b-none"
          >
            <Table>
              <THead
                className="sticky top-0 z-20"
                style={{ height: collapseEnvironments ? headerHeight : undefined }}
              >
                <Tr
                  className="sticky top-0 z-20 border-0"
                  style={{ height: collapseEnvironments ? headerHeight : undefined }}
                >
                  <Th
                    className="sticky left-0 z-20 min-w-[20rem] border-b-0 p-0"
                    style={{ height: collapseEnvironments ? headerHeight : undefined }}
                  >
                    <div
                      className={twMerge(
                        "flex h-full border-b border-mineshaft-600 pr-5 pb-3 pl-3",
                        !collapseEnvironments && "border-r pt-3.5"
                      )}
                    >
                      <div
                        className={twMerge("flex items-center", collapseEnvironments && "mt-auto")}
                      >
                        <Tooltip
                          className="max-w-[20rem] whitespace-nowrap capitalize"
                          content={
                            totalCount > 0
                              ? `${
                                  !allRowsSelectedOnPage.isChecked ? "Select" : "Unselect"
                                } all folders and secrets on page`
                              : ""
                          }
                        >
                          <div className="mr-4 ml-2">
                            <Checkbox
                              isDisabled={totalCount === 0}
                              id="checkbox-select-all-rows"
                              isChecked={allRowsSelectedOnPage.isChecked}
                              isIndeterminate={allRowsSelectedOnPage.isIndeterminate}
                              onCheckedChange={toggleSelectAllRows}
                            />
                          </div>
                        </Tooltip>
                        Name
                        <IconButton
                          variant="plain"
                          className="ml-2"
                          ariaLabel="sort"
                          onClick={() =>
                            setOrderDirection((prev) =>
                              prev === OrderByDirection.ASC
                                ? OrderByDirection.DESC
                                : OrderByDirection.ASC
                            )
                          }
                        >
                          <FontAwesomeIcon
                            icon={orderDirection === "asc" ? faArrowDown : faArrowUp}
                          />
                        </IconButton>
                      </div>
                      <Tooltip
                        content={
                          collapseEnvironments ? "Expand Environments" : "Collapse Environments"
                        }
                        className="capitalize"
                      >
                        <IconButton
                          ariaLabel="Toggle Environment View"
                          variant="plain"
                          colorSchema="secondary"
                          className="mt-auto ml-auto h-min p-1"
                          onClick={handleToggleNarrowHeader}
                        >
                          <FontAwesomeIcon
                            icon={collapseEnvironments ? faArrowLeft : faArrowRight}
                          />
                        </IconButton>
                      </Tooltip>
                    </div>
                  </Th>
                  {visibleEnvs?.map(({ name, slug }, index) => {
                    const envSecKeyCount = getEnvSecretKeyCount(slug);
                    const importedSecKeyCount = getEnvImportedSecretKeyCount(slug);
                    const missingKeyCount = secKeys.length - envSecKeyCount - importedSecKeyCount;

                    const isLast = index === visibleEnvs.length - 1;

                    return (
                      <Th
                        className={twMerge(
                          "min-table-row border-b-0 p-0 text-xs",
                          collapseEnvironments && index === visibleEnvs.length - 1 && "mr-8!",
                          !collapseEnvironments && "min-w-44 text-center"
                        )}
                        style={
                          collapseEnvironments
                            ? {
                                height: headerHeight,
                                width: "w-4"
                              }
                            : undefined
                        }
                        key={`secret-overview-${name}-${index + 1}`}
                      >
                        <Tooltip
                          content={
                            <div className="flex flex-col gap-2">
                              {collapseEnvironments ? (
                                <p className="whitespace-break-spaces text-mineshaft-300">{name}</p>
                              ) : (
                                ""
                              )}
                              <div className="flex items-center gap-2">
                                <p className="text-xs text-mineshaft-300">{slug}</p>
                                <IconButton
                                  variant="plain"
                                  colorSchema="secondary"
                                  ariaLabel="Copy environment slug"
                                  onClick={() => copyToClipboard(slug)}
                                >
                                  <FontAwesomeIcon icon={isCopied ? faCheck : faCopy} />
                                </IconButton>
                              </div>
                            </div>
                          }
                          side="bottom"
                          sideOffset={5}
                          align="center"
                          className="max-w-xl text-xs normal-case"
                          rootProps={{
                            disableHoverableContent: false
                          }}
                        >
                          <div
                            className={twMerge(
                              "border-b border-mineshaft-600",
                              collapseEnvironments
                                ? "relative"
                                : "flex items-center justify-center px-5 pt-3.5 pb-[0.82rem]",
                              collapseEnvironments && isLast && "overflow-clip"
                            )}
                            style={{
                              height: collapseEnvironments ? headerHeight : undefined,
                              minWidth: collapseEnvironments ? "2.9rem" : undefined,
                              width: collapseEnvironments && isLast ? headerHeight * 0.3 : undefined
                            }}
                          >
                            <div
                              className={twMerge(
                                "border-mineshaft-600",
                                collapseEnvironments
                                  ? "-skew-x-[16rad] transform border-l text-xs"
                                  : "flex items-center justify-center"
                              )}
                              style={{
                                height: collapseEnvironments ? headerHeight : undefined,
                                marginLeft: collapseEnvironments ? headerHeight * 0.145 : undefined
                              }}
                            />
                            <button
                              type="button"
                              className={twMerge(
                                "duration-100 hover:text-mineshaft-100",
                                collapseEnvironments
                                  ? "absolute -rotate-[72.75deg] text-left text-sm font-normal"
                                  : "flex items-center text-center text-sm font-medium"
                              )}
                              style={getHeaderStyle({
                                collapseEnvironments,
                                isLast,
                                headerHeight
                              })}
                              onClick={() => handleExploreEnvClick(slug)}
                            >
                              <p className="truncate font-medium underline">{name}</p>
                            </button>
                            {!collapseEnvironments && missingKeyCount > 0 && (
                              <Tooltip
                                className="max-w-none lowercase"
                                content={`${missingKeyCount} secrets missing\n compared to other environments`}
                              >
                                <div className="ml-2 flex h-[1.1rem] cursor-default items-center justify-center rounded-xs border border-red-400 bg-red-600 p-1 text-xs font-medium text-bunker-100">
                                  <span className="text-bunker-100">{missingKeyCount}</span>
                                </div>
                              </Tooltip>
                            )}
                          </div>
                        </Tooltip>
                      </Th>
                    );
                  })}
                </Tr>
                {collapseEnvironments && (
                  <HeaderResizer
                    onMouseDown={handleMouseDown}
                    isActive={isResizing}
                    scrollOffset={scrollOffset}
                    heightOffset={(tableRef.current?.clientTop ?? 0) + headerHeight - 2.5}
                  />
                )}
              </THead>
              <TBody>
                {canViewOverviewPage && isOverviewLoading && (
                  <TableSkeleton
                    columns={visibleEnvs.length + 1}
                    innerKey="secret-overview-loading"
                    rows={5}
                    className="bg-mineshaft-700"
                  />
                )}
                {userAvailableEnvs.length === 0 && (
                  <Tr>
                    <Td colSpan={visibleEnvs.length + 1}>
                      <EmptyState
                        title="You have no environments, start by adding some"
                        iconSize="3x"
                      >
                        <Link
                          to="/organizations/$orgId/projects/secret-management/$projectId/settings"
                          params={{
                            orgId,
                            projectId
                          }}
                          hash="environments"
                        >
                          <Button
                            className="mt-4"
                            variant="outline_bg"
                            colorSchema="primary"
                            size="md"
                          >
                            Add environments
                          </Button>
                        </Link>
                      </EmptyState>
                    </Td>
                  </Tr>
                )}
                {isTableEmpty && !isOverviewLoading && visibleEnvs.length > 0 && (
                  <Tr>
                    <Td colSpan={visibleEnvs.length + 1}>
                      <EmptyState
                        title={
                          isTableFiltered || debouncedSearchFilter
                            ? "No secrets found for your search, add one now"
                            : "Let's add some secrets"
                        }
                        icon={faFolderBlank}
                        iconSize="3x"
                      >
                        <Button
                          className="mt-4"
                          variant="outline_bg"
                          colorSchema="primary"
                          size="md"
                          onClick={() => handlePopUpOpen("addSecretsInAllEnvs")}
                        >
                          Add Secrets
                        </Button>
                      </EmptyState>
                    </Td>
                  </Tr>
                )}
                {!isOverviewLoading && visibleEnvs.length > 0 && (
                  <>
                    {folderNamesAndDescriptions.map(({ name: folderName, description }, index) => (
                      <SecretOverviewFolderRow
                        folderName={folderName}
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
                      />
                    ))}
                    {dynamicSecretNames.map((dynamicSecretName, index) => (
                      <SecretOverviewDynamicSecretRow
                        dynamicSecretName={dynamicSecretName}
                        isDynamicSecretInEnv={isDynamicSecretPresentInEnv}
                        environments={visibleEnvs}
                        key={`overview-${dynamicSecretName}-${index + 1}`}
                      />
                    ))}
                    {secretRotationNames.map((secretRotationName, index) => (
                      <SecretOverviewSecretRotationRow
                        secretRotationName={secretRotationName}
                        isSecretRotationInEnv={isSecretRotationPresentInEnv}
                        environments={visibleEnvs}
                        getSecretRotationByName={getSecretRotationByName}
                        getSecretRotationStatusesByName={getSecretRotationStatusesByName}
                        key={`overview-${secretRotationName}-${index + 1}`}
                        scrollOffset={scrollOffset}
                        onEdit={(secretRotation) =>
                          handlePopUpOpen("editSecretRotation", secretRotation)
                        }
                        onRotate={(secretRotation) =>
                          handlePopUpOpen("rotateSecretRotation", secretRotation)
                        }
                        onViewGeneratedCredentials={(secretRotation) =>
                          handlePopUpOpen("viewSecretRotationGeneratedCredentials", secretRotation)
                        }
                        onDelete={(secretRotation) =>
                          handlePopUpOpen("deleteSecretRotation", secretRotation)
                        }
                      />
                    ))}
                    {secKeys.map((key, index) => (
                      <SecretOverviewTableRow
                        isSelected={Boolean(selectedEntries.secret[key])}
                        onToggleSecretSelect={() => toggleSelectedEntry(EntryType.SECRET, key)}
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
                        scrollOffset={debouncedScrollOffset}
                        importedBy={importedBy}
                      />
                    ))}
                    <SecretNoAccessOverviewTableRow
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
              </TBody>
              <TFoot>
                <Tr className="sticky bottom-0 z-10 border-0 bg-mineshaft-800">
                  <Td className="sticky left-0 z-10 border-0 bg-mineshaft-800 p-0">
                    <div
                      className="w-full border-t border-r border-mineshaft-600"
                      style={{ height: "45px" }}
                    />
                  </Td>
                  {visibleEnvs?.map(({ name, slug }, i) => (
                    <Td
                      key={`explore-${name}-btn-${i + 1}`}
                      className="border-0 border-r border-mineshaft-600 p-0"
                    >
                      <div
                        className={twMerge(
                          "flex w-full items-center justify-center border-t border-mineshaft-600 py-2"
                        )}
                      >
                        {collapseEnvironments ? (
                          <Tooltip className="normal-case" content="Explore Environment">
                            <IconButton
                              ariaLabel="Explore Environment"
                              size="xs"
                              variant="outline_bg"
                              className="mx-auto h-[1.76rem] rounded-sm"
                              onClick={() => handleExploreEnvClick(slug)}
                            >
                              <FontAwesomeIcon icon={faArrowRightToBracket} />
                            </IconButton>
                          </Tooltip>
                        ) : (
                          <Button
                            leftIcon={
                              <FontAwesomeIcon className="mr-1" icon={faArrowRightToBracket} />
                            }
                            variant="outline_bg"
                            size="xs"
                            className="mx-2 w-full"
                            onClick={() => handleExploreEnvClick(slug)}
                          >
                            Explore
                          </Button>
                        )}
                      </div>
                    </Td>
                  ))}
                </Tr>
              </TFoot>
            </Table>
          </TableContainer>
          {!isOverviewLoading && totalCount > 0 && (
            <Pagination
              startAdornment={
                <SecretTableResourceCount
                  dynamicSecretCount={totalDynamicSecretCount}
                  secretCount={totalSecretCount}
                  folderCount={totalFolderCount}
                  importCount={totalImportCount}
                  secretRotationCount={totalSecretRotationCount}
                />
              }
              className="rounded-b-md border-t border-solid border-t-mineshaft-600"
              count={totalCount}
              page={page}
              perPage={perPage}
              onChangePage={(newPage) => setPage(newPage)}
              onChangePerPage={handlePerPageChange}
            />
          )}
        </div>
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
    </div>
  );
};
