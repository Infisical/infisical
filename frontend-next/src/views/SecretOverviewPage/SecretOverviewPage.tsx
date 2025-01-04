import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import { useRouter } from "next/router";
import { subject } from "@casl/ability";
import { faCheckCircle } from "@fortawesome/free-regular-svg-icons";
import {
  faAngleDown,
  faArrowDown,
  faArrowUp,
  faFingerprint,
  faFolder,
  faFolderBlank,
  faFolderPlus,
  faKey,
  faList,
  faPlus
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import NavHeader from "@app/components/navigation/NavHeader";
import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
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
  Modal,
  ModalContent,
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
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useOrganization,
  useProjectPermission,
  useWorkspace
} from "@app/context";
import { useDebounce, usePagination, usePopUp, useResetPageHelper } from "@app/hooks";
import {
  useCreateFolder,
  useCreateSecretV3,
  useDeleteSecretV3,
  useGetImportedSecretsAllEnvs,
  useGetWsTags,
  useUpdateSecretV3
} from "@app/hooks/api";
import { useGetProjectSecretsOverview } from "@app/hooks/api/dashboard/queries";
import { DashboardSecretsOrderBy } from "@app/hooks/api/dashboard/types";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { useUpdateFolderBatch } from "@app/hooks/api/secretFolders/queries";
import { TUpdateFolderBatchDTO } from "@app/hooks/api/secretFolders/types";
import { SecretType, SecretV3RawSanitized, TSecretFolder } from "@app/hooks/api/types";
import { ProjectType, ProjectVersion } from "@app/hooks/api/workspace/types";
import { useDynamicSecretOverview, useFolderOverview, useSecretOverview } from "@app/hooks/utils";
import { SecretOverviewDynamicSecretRow } from "@app/views/SecretOverviewPage/components/SecretOverviewDynamicSecretRow";
import {
  SecretNoAccessOverviewTableRow,
  SecretOverviewTableRow
} from "@app/views/SecretOverviewPage/components/SecretOverviewTableRow";
import { SecretSearchInput } from "@app/views/SecretOverviewPage/components/SecretSearchInput";
import { SecretTableResourceCount } from "@app/views/SecretOverviewPage/components/SecretTableResourceCount";

import { FolderForm } from "../SecretMainPage/components/ActionBar/FolderForm";
import { CreateSecretForm } from "./components/CreateSecretForm";
import { FolderBreadCrumbs } from "./components/FolderBreadCrumbs";
import { SecretOverviewFolderRow } from "./components/SecretOverviewFolderRow";
import { SecretV2MigrationSection } from "./components/SecretV2MigrationSection";
import { SelectionPanel } from "./components/SelectionPanel/SelectionPanel";

export enum EntryType {
  FOLDER = "folder",
  SECRET = "secret"
}

enum RowType {
  Folder = "folder",
  DynamicSecret = "dynamic",
  Secret = "secret"
}

type Filter = {
  [key in RowType]: boolean;
};

const DEFAULT_FILTER_STATE = {
  [RowType.Folder]: true,
  [RowType.DynamicSecret]: true,
  [RowType.Secret]: true
};

export const SecretOverviewPage = () => {
  const { t } = useTranslation();

  const router = useRouter();
  const [scrollOffset, setScrollOffset] = useState(0);
  const [debouncedScrollOffset] = useDebounce(scrollOffset);
  const { permission } = useProjectPermission();

  const { currentWorkspace, isLoading: isWorkspaceLoading } = useWorkspace();
  const isProjectV3 = currentWorkspace?.version === ProjectVersion.V3;
  const { currentOrg } = useOrganization();
  const workspaceId = currentWorkspace?.id as string;
  const projectSlug = currentWorkspace?.slug as string;
  const [searchFilter, setSearchFilter] = useState("");
  const [debouncedSearchFilter, setDebouncedSearchFilter] = useDebounce(searchFilter);
  const secretPath = (router.query?.secretPath as string) || "/";

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
  } = usePagination<DashboardSecretsOrderBy>(DashboardSecretsOrderBy.Name);

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

    router.events.on("routeChangeStart", onRouteChangeStart);

    return () => {
      router.events.off("routeChangeStart", onRouteChangeStart);
    };
  }, []);

  useEffect(() => {
    if (!isWorkspaceLoading && !workspaceId && router.isReady) {
      router.push(`/org/${currentOrg?.id}/${ProjectType.SecretManager}/overview`);
    }
  }, [isWorkspaceLoading, workspaceId, router.isReady]);

  const userAvailableEnvs = currentWorkspace?.environments || [];

  const [visibleEnvs, setVisibleEnvs] = useState(userAvailableEnvs);

  useEffect(() => {
    setVisibleEnvs(userAvailableEnvs);
  }, [userAvailableEnvs]);

  const { isImportedSecretPresentInEnv, getImportedSecretByKey, getEnvImportedSecretKeyCount } =
    useGetImportedSecretsAllEnvs({
      projectId: workspaceId,
      path: secretPath,
      environments: (userAvailableEnvs || []).map(({ slug }) => slug)
    });

  const { isLoading: isOverviewLoading, data: overview } = useGetProjectSecretsOverview(
    {
      projectId: workspaceId,
      environments: visibleEnvs.map((env) => env.slug),
      secretPath,
      orderDirection,
      orderBy,
      includeFolders: filter.folder,
      includeDynamicSecrets: filter.dynamic,
      includeSecrets: filter.secret,
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
    totalFolderCount,
    totalSecretCount,
    totalDynamicSecretCount,
    totalCount = 0,
    totalUniqueFoldersInPage,
    totalUniqueSecretsInPage,
    totalUniqueDynamicSecretsInPage
  } = overview ?? {};

  useResetPageHelper({
    totalCount,
    offset,
    setPage
  });

  const { folderNames, getFolderByNameAndEnv, isFolderPresentInEnv } = useFolderOverview(folders);

  const { dynamicSecretNames, isDynamicSecretPresentInEnv } =
    useDynamicSecretOverview(dynamicSecrets);

  const { secKeys, getSecretByKey, getEnvSecretKeyCount } = useSecretOverview(secrets);
  const { data: tags } = useGetWsTags(
    permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.Tags) ? workspaceId : ""
  );

  const { mutateAsync: createSecretV3 } = useCreateSecretV3();
  const { mutateAsync: updateSecretV3 } = useUpdateSecretV3();
  const { mutateAsync: deleteSecretV3 } = useDeleteSecretV3();
  const { mutateAsync: createFolder } = useCreateFolder();
  const { mutateAsync: updateFolderBatch } = useUpdateFolderBatch();

  const { handlePopUpOpen, handlePopUpToggle, handlePopUpClose, popUp } = usePopUp([
    "addSecretsInAllEnvs",
    "addFolder",
    "misc",
    "updateFolder"
  ] as const);

  const handleFolderCreate = async (folderName: string) => {
    const promises = userAvailableEnvs.map((env) => {
      const environment = env.slug;
      return createFolder({
        name: folderName,
        path: secretPath,
        environment,
        projectId: workspaceId
      });
    });

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

  const handleFolderUpdate = async (newFolderName: string) => {
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
            path: secretPath
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
        projectSlug,
        folders: updatedFolders,
        projectId: workspaceId
      });
      createNotification({
        type: "success",
        text: "Successfully renamed folder across environments"
      });
    } catch (err) {
      createNotification({
        type: "error",
        text: "Failed to rename folder across environments"
      });
    } finally {
      handlePopUpClose("updateFolder");
    }
  };

  const handleSecretCreate = async (env: string, key: string, value: string) => {
    try {
      // create folder if not existing
      if (secretPath !== "/") {
        // /hello/world -> [hello","world"]
        const pathSegment = secretPath.split("/").filter(Boolean);
        const parentPath = `/${pathSegment.slice(0, -1).join("/")}`;
        const folderName = pathSegment.at(-1);
        if (folderName && parentPath) {
          await createFolder({
            projectId: workspaceId,
            path: parentPath,
            environment: env,
            name: folderName
          });
        }
      }
      const result = await createSecretV3({
        environment: env,
        workspaceId,
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
    } catch (error) {
      console.log(error);
      createNotification({
        type: "error",
        text: "Failed to create secret"
      });
    }
  };

  const handleEnvSelect = (envId: string) => {
    if (visibleEnvs.map((env) => env.id).includes(envId)) {
      setVisibleEnvs(visibleEnvs.filter((env) => env.id !== envId));
    } else {
      setVisibleEnvs(visibleEnvs.concat(userAvailableEnvs.filter((env) => env.id === envId)));
    }
  };

  const handleSecretUpdate = async (
    env: string,
    key: string,
    value: string,
    type = SecretType.Shared
  ) => {
    try {
      const result = await updateSecretV3({
        environment: env,
        workspaceId,
        secretPath,
        secretKey: key,
        secretValue: value,
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
    } catch (error) {
      console.log(error);
      createNotification({
        type: "error",
        text: "Failed to update secret"
      });
    }
  };

  const handleSecretDelete = async (env: string, key: string, secretId?: string) => {
    try {
      const result = await deleteSecretV3({
        environment: env,
        workspaceId,
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
    } catch (error) {
      console.log(error);
      createNotification({
        type: "error",
        text: "Failed to delete secret"
      });
    }
  };

  const handleResetSearch = (path: string) => {
    const restore = filterHistory.get(path);
    setFilter(restore?.filter ?? DEFAULT_FILTER_STATE);
    const search = restore?.searchFilter ?? "";
    setSearchFilter(search);
    setDebouncedSearchFilter(search);
  };

  const handleFolderClick = (path: string) => {
    // store for breadcrumb nav to restore previously used filters
    setFilterHistory((prev) => {
      const curr = new Map(prev);
      curr.set(secretPath, { filter, searchFilter });
      return curr;
    });

    router
      .push({
        pathname: router.pathname,
        query: {
          ...router.query,
          secretPath: `${router.query?.secretPath || ""}/${path}`
        }
      })
      .then(() => {
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
        await createFolder({
          projectId: workspaceId,
          environment: slug,
          path: parentPath,
          name: folderName
        });
      }
    }

    const query: Record<string, string> = { ...router.query, env: slug, searchFilter };
    const envIndex = visibleEnvs.findIndex((el) => slug === el.slug);
    if (envIndex !== -1) {
      router.push({
        pathname: `/${ProjectType.SecretManager}/[id]/secrets/[env]`,
        query
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
    if (router.query.search) {
      const { search, ...query } = router.query;
      // temp workaround until we transition state to query params
      router.push({
        pathname: router.pathname,
        query
      });
      setFilter(DEFAULT_FILTER_STATE);
      setSearchFilter(router.query.search as string);
      setDebouncedSearchFilter(router.query.search as string);
    }
  }, [router.query.search]);

  if (isWorkspaceLoading || (isProjectV3 && visibleEnvs.length > 0 && isOverviewLoading)) {
    return (
      <div className="container mx-auto flex h-screen w-full items-center justify-center px-8 text-mineshaft-50 dark:[color-scheme:dark]">
        <img
          src="/images/loading/loading.gif"
          height={70}
          width={120}
          alt="loading animation"
          decoding="async"
          loading="lazy"
        />
      </div>
    );
  }

  const canViewOverviewPage = Boolean(userAvailableEnvs.length);
  // This is needed to also show imports from other paths – right now those are missing.
  // const combinedKeys = [...secKeys, ...secretImports.map((impSecrets) => impSecrets?.data?.map((impSec) => impSec.secrets?.map((impSecKey) => impSecKey.key))).flat().flat()];

  const isTableEmpty = totalCount === 0;

  const isTableFiltered =
    Boolean(Object.values(filter).filter((enabled) => !enabled).length) ||
    userAvailableEnvs.length !== visibleEnvs.length;

  if (!isProjectV3)
    return (
      <div className="flex h-full w-full flex-col items-center justify-center px-6 text-mineshaft-50 dark:[color-scheme:dark]">
        <SecretV2MigrationSection />
      </div>
    );

  return (
    <>
      <div className="container mx-auto px-6 text-mineshaft-50 dark:[color-scheme:dark]">
        <div className="relative right-5 ml-4">
          <NavHeader pageName={t("dashboard.title")} isProjectRelated />
        </div>
        <div className="space-y-8">
          <div className="flex w-full items-baseline justify-between">
            <div className="mt-6">
              <p className="text-3xl font-semibold text-bunker-100">Secrets Overview</p>
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
            </div>
          </div>
          <div className="flex items-center justify-between">
            <FolderBreadCrumbs secretPath={secretPath} onResetSearch={handleResetSearch} />
            <div className="flex flex-row items-center justify-center space-x-2">
              {userAvailableEnvs.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <IconButton
                      ariaLabel="Environments"
                      variant="plain"
                      size="sm"
                      className={twMerge(
                        "flex h-10 w-11 items-center justify-center overflow-hidden border border-mineshaft-600 bg-mineshaft-800 p-0 transition-all hover:border-primary/60 hover:bg-primary/10",
                        isTableFiltered && "border-primary/50 text-primary"
                      )}
                    >
                      <Tooltip content="Choose visible environments" className="mb-2">
                        <FontAwesomeIcon icon={faList} />
                      </Tooltip>
                    </IconButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
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
                    <DropdownMenuLabel>Filter project resources</DropdownMenuLabel>
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
                      icon={
                        filter[RowType.DynamicSecret] && <FontAwesomeIcon icon={faCheckCircle} />
                      }
                      iconPos="right"
                    >
                      <div className="flex items-center gap-2">
                        <FontAwesomeIcon icon={faFingerprint} className=" text-yellow-700" />
                        <span>Dynamic Secrets</span>
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
                        <FontAwesomeIcon icon={faKey} className=" text-bunker-300" />
                        <span>Secrets</span>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuLabel>Choose visible environments</DropdownMenuLabel>
                    {userAvailableEnvs.map((availableEnv) => {
                      const { id: envId, name } = availableEnv;

                      const isEnvSelected = visibleEnvs.map((env) => env.id).includes(envId);
                      return (
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.preventDefault();
                            handleEnvSelect(envId);
                          }}
                          key={envId}
                          disabled={visibleEnvs?.length === 1}
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
                projectId={currentWorkspace?.id!}
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
                              leftIcon={<FontAwesomeIcon icon={faFolderPlus} />}
                              onClick={() => {
                                handlePopUpOpen("addFolder");
                                handlePopUpClose("misc");
                              }}
                              isDisabled={!isAllowed}
                              variant="outline_bg"
                              className="h-10"
                              isFullWidth
                            >
                              Add Folder
                            </Button>
                          )}
                        </ProjectPermissionCan>
                      </div>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </div>
          </div>
        </div>
        <SelectionPanel
          secretPath={secretPath}
          selectedEntries={selectedEntries}
          resetSelectedEntries={resetSelectedEntries}
        />
        <div className="thin-scrollbar mt-4">
          <TableContainer
            onScroll={(e) => setScrollOffset(e.currentTarget.scrollLeft)}
            className="thin-scrollbar rounded-b-none"
          >
            <Table>
              <THead>
                <Tr className="sticky top-0 z-20 border-0">
                  <Th className="sticky left-0 z-20 min-w-[20rem] border-b-0 p-0">
                    <div className="flex items-center border-b border-r border-mineshaft-600 pr-5 pl-3 pt-3.5 pb-3">
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
                  </Th>
                  {visibleEnvs?.map(({ name, slug }, index) => {
                    const envSecKeyCount = getEnvSecretKeyCount(slug);
                    const importedSecKeyCount = getEnvImportedSecretKeyCount(slug);
                    const missingKeyCount = secKeys.length - envSecKeyCount - importedSecKeyCount;

                    return (
                      <Th
                        className="min-table-row min-w-[11rem] border-b-0 p-0 text-center"
                        key={`secret-overview-${name}-${index + 1}`}
                      >
                        <div className="flex items-center justify-center border-b border-mineshaft-600 px-5 pt-3.5 pb-[0.83rem]">
                          <button
                            type="button"
                            className="text-sm font-medium duration-100 hover:text-mineshaft-100"
                            onClick={() => handleExploreEnvClick(slug)}
                          >
                            {name}
                          </button>
                          {missingKeyCount > 0 && (
                            <Tooltip
                              className="max-w-none lowercase"
                              content={`${missingKeyCount} secrets missing\n compared to other environments`}
                            >
                              <div className="ml-2 flex h-[1.1rem] cursor-default items-center justify-center rounded-sm border border-red-400 bg-red-600 p-1 text-xs font-medium text-bunker-100">
                                <span className="text-bunker-100">{missingKeyCount}</span>
                              </div>
                            </Tooltip>
                          )}
                        </div>
                      </Th>
                    );
                  })}
                </Tr>
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
                {userAvailableEnvs.length > 0 && visibleEnvs.length === 0 && (
                  <Tr>
                    <Td colSpan={visibleEnvs.length + 1}>
                      <EmptyState title="You have no visible environments" iconSize="3x" />
                    </Td>
                  </Tr>
                )}
                {userAvailableEnvs.length === 0 && (
                  <Tr>
                    <Td colSpan={visibleEnvs.length + 1}>
                      <EmptyState
                        title="You have no environments, start by adding some"
                        iconSize="3x"
                      >
                        <Link
                          href={{
                            pathname: "/project/[id]/settings",
                            query: { id: workspaceId },
                            hash: "environments"
                          }}
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
                          debouncedSearchFilter
                            ? "No secret found for your search, add one now"
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
                    {folderNames.map((folderName, index) => (
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
                          handlePopUpOpen("updateFolder", { name })
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
                    {secKeys.map((key, index) => (
                      <SecretOverviewTableRow
                        isSelected={Boolean(selectedEntries.secret[key])}
                        onToggleSecretSelect={() => toggleSelectedEntry(EntryType.SECRET, key)}
                        secretPath={secretPath}
                        getImportedSecretByKey={getImportedSecretByKey}
                        isImportedSecretPresentInEnv={isImportedSecretPresentInEnv}
                        onSecretCreate={handleSecretCreate}
                        onSecretDelete={handleSecretDelete}
                        onSecretUpdate={handleSecretUpdate}
                        key={`overview-${key}-${index + 1}`}
                        environments={visibleEnvs}
                        secretKey={key}
                        getSecretByKey={getSecretByKey}
                        scrollOffset={debouncedScrollOffset}
                      />
                    ))}
                    <SecretNoAccessOverviewTableRow
                      environments={visibleEnvs}
                      count={Math.max(
                        (page * perPage > totalCount ? totalCount % perPage : perPage) -
                          (totalUniqueFoldersInPage || 0) -
                          (totalUniqueDynamicSecretsInPage || 0) -
                          (totalUniqueSecretsInPage || 0),
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
                  {visibleEnvs?.map(({ name, slug }) => (
                    <Td key={`explore-${name}-btn`} className="border-0 border-mineshaft-600 p-0">
                      <div className="flex w-full items-center justify-center border-r border-t border-mineshaft-600 px-5 py-2">
                        <Button
                          size="xs"
                          variant="outline_bg"
                          isFullWidth
                          onClick={() => handleExploreEnvClick(slug)}
                        >
                          Explore
                        </Button>
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
            onUpdateFolder={handleFolderUpdate}
          />
        </ModalContent>
      </Modal>
    </>
  );
};
