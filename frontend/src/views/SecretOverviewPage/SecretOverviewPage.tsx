import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import { useRouter } from "next/router";
import { subject } from "@casl/ability";
import { faCheckCircle, faCircle } from "@fortawesome/free-regular-svg-icons";
import {
  faAngleDown,
  faArrowDown,
  faArrowUp,
  faFolderBlank,
  faFolderPlus,
  faList,
  faMagnifyingGlass,
  faPlus
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import NavHeader from "@app/components/navigation/NavHeader";
import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  EmptyState,
  IconButton,
  Input,
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
import { useDebounce, usePopUp } from "@app/hooks";
import {
  useCreateFolder,
  useCreateSecretV3,
  useDeleteSecretV3,
  useGetDynamicSecretsOfAllEnv,
  useGetFoldersByEnv,
  useGetImportedSecretsAllEnvs,
  useGetProjectSecretsAllEnv,
  useUpdateSecretV3
} from "@app/hooks/api";
import { useUpdateFolderBatch } from "@app/hooks/api/secretFolders/queries";
import { TUpdateFolderBatchDTO } from "@app/hooks/api/secretFolders/types";
import { SecretType, TSecretFolder } from "@app/hooks/api/types";

import { FolderForm } from "../SecretMainPage/components/ActionBar/FolderForm";
import { CreateSecretForm } from "./components/CreateSecretForm";
import { FolderBreadCrumbs } from "./components/FolderBreadCrumbs";
import { SecretOverviewDynamicSecretRow } from "./components/SecretOverviewDynamicSecretRow";
import { SecretOverviewFolderRow } from "./components/SecretOverviewFolderRow";
import { SecretOverviewTableRow } from "./components/SecretOverviewTableRow";
import { SecretV2MigrationSection } from "./components/SecretV2MigrationSection";
import { SelectionPanel } from "./components/SelectionPanel/SelectionPanel";

export enum EntryType {
  FOLDER = "folder",
  SECRET = "secret"
}

enum RowType {
  Folder = "folder",
  DynamicSecret = "dynamic",
  Secret = "Secret"
}

const INIT_PER_PAGE = 20;

export const SecretOverviewPage = () => {
  const { t } = useTranslation();

  const router = useRouter();

  // this is to set expandable table width
  // coz when overflow the table goes to the right
  const parentTableRef = useRef<HTMLTableElement>(null);
  const [expandableTableWidth, setExpandableTableWidth] = useState(0);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const { permission } = useProjectPermission();

  useEffect(() => {
    if (parentTableRef.current) {
      setExpandableTableWidth(parentTableRef.current.clientWidth);
    }
  }, [parentTableRef.current]);

  const { currentWorkspace, isLoading: isWorkspaceLoading } = useWorkspace();
  const { currentOrg } = useOrganization();
  const workspaceId = currentWorkspace?.id as string;
  const projectSlug = currentWorkspace?.slug as string;
  const [searchFilter, setSearchFilter] = useState("");
  const debouncedSearchFilter = useDebounce(searchFilter);
  const secretPath = (router.query?.secretPath as string) || "/";

  const [selectedEntries, setSelectedEntries] = useState<{
    [EntryType.FOLDER]: Record<string, boolean>;
    [EntryType.SECRET]: Record<string, boolean>;
  }>({
    [EntryType.FOLDER]: {},
    [EntryType.SECRET]: {}
  });

  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(INIT_PER_PAGE);

  const toggleSelectedEntry = useCallback(
    (type: EntryType, key: string) => {
      const isChecked = Boolean(selectedEntries[type]?.[key]);
      const newChecks = { ...selectedEntries };

      // remove selection if its present else add it
      if (isChecked) {
        delete newChecks[type][key];
      } else {
        newChecks[type][key] = true;
      }

      setSelectedEntries(newChecks);
    },
    [selectedEntries]
  );

  const resetSelectedEntries = useCallback(() => {
    setSelectedEntries({
      [EntryType.FOLDER]: {},
      [EntryType.SECRET]: {}
    });
  }, []);

  useEffect(() => {
    const handleParentTableWidthResize = () => {
      setExpandableTableWidth(parentTableRef.current?.clientWidth || 0);
    };

    const onRouteChangeStart = () => {
      resetSelectedEntries();
    };

    router.events.on("routeChangeStart", onRouteChangeStart);

    window.addEventListener("resize", handleParentTableWidthResize);
    return () => {
      window.removeEventListener("resize", handleParentTableWidthResize);
      router.events.off("routeChangeStart", onRouteChangeStart);
    };
  }, []);

  useEffect(() => {
    if (!isWorkspaceLoading && !workspaceId && router.isReady) {
      router.push(`/org/${currentOrg?.id}/overview`);
    }
  }, [isWorkspaceLoading, workspaceId, router.isReady]);

  const userAvailableEnvs = currentWorkspace?.environments || [];
  const [visibleEnvs, setVisibleEnvs] = useState(
    userAvailableEnvs?.filter(({ slug }) =>
      permission.can(
        ProjectPermissionActions.Read,
        subject(ProjectPermissionSub.Secrets, {
          environment: slug,
          secretPath
        })
      )
    )
  );

  useEffect(() => {
    setVisibleEnvs(
      userAvailableEnvs?.filter(({ slug }) =>
        permission.can(
          ProjectPermissionActions.Read,
          subject(ProjectPermissionSub.Secrets, {
            environment: slug,
            secretPath
          })
        )
      )
    );
  }, [userAvailableEnvs, secretPath]);

  const {
    data: secrets,
    getSecretByKey,
    secKeys,
    getEnvSecretKeyCount
  } = useGetProjectSecretsAllEnv({
    workspaceId,
    envs: userAvailableEnvs.map(({ slug }) => slug),
    secretPath
  });

  const { folders, folderNames, isFolderPresentInEnv, getFolderByNameAndEnv } = useGetFoldersByEnv({
    projectId: workspaceId,
    path: secretPath,
    environments: userAvailableEnvs.map(({ slug }) => slug)
  });

  const { isImportedSecretPresentInEnv, getImportedSecretByKey } = useGetImportedSecretsAllEnvs({
    projectId: workspaceId,
    path: secretPath,
    environments: userAvailableEnvs.map(({ slug }) => slug)
  });

  const { dynamicSecretNames, dynamicSecrets, isDynamicSecretPresentInEnv } =
    useGetDynamicSecretsOfAllEnv({
      projectSlug,
      environmentSlugs: userAvailableEnvs.map(({ slug }) => slug),
      path: secretPath
    });

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
          subject(ProjectPermissionSub.Secrets, { environment: env.slug, secretPath })
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
      await createSecretV3({
        environment: env,
        workspaceId,
        secretPath,
        secretKey: key,
        secretValue: value,
        secretComment: "",
        type: SecretType.Shared
      });
      createNotification({
        type: "success",
        text: "Successfully created secret"
      });
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
      await updateSecretV3({
        environment: env,
        workspaceId,
        secretPath,
        secretKey: key,
        secretValue: value,
        type
      });
      createNotification({
        type: "success",
        text: "Successfully updated secret"
      });
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
      await deleteSecretV3({
        environment: env,
        workspaceId,
        secretPath,
        secretKey: key,
        secretId,
        type: SecretType.Shared
      });
      createNotification({
        type: "success",
        text: "Successfully deleted secret"
      });
    } catch (error) {
      console.log(error);
      createNotification({
        type: "error",
        text: "Failed to delete secret"
      });
    }
  };

  const handleResetSearch = () => setSearchFilter("");

  const handleFolderClick = (path: string) => {
    router.push({
      pathname: router.pathname,
      query: {
        ...router.query,
        secretPath: `${router.query?.secretPath || ""}/${path}`
      }
    });
  };

  const handleExploreEnvClick = async (slug: string) => {
    if (secretPath !== "/") {
      const pathSegment = secretPath.split("/").filter(Boolean);
      const parentPath = `/${pathSegment.slice(0, -1).join("/")}`;
      const folderName = pathSegment.at(-1);
      const canCreateFolder = permission.rules.some((rule) =>
        (rule.subject as ProjectPermissionSub[]).includes(ProjectPermissionSub.SecretFolders)
      )
        ? permission.can(
            ProjectPermissionActions.Create,
            subject(ProjectPermissionSub.SecretFolders, {
              environment: slug,
              secretPath: parentPath
            })
          )
        : permission.can(
            ProjectPermissionActions.Create,
            subject(ProjectPermissionSub.Secrets, { environment: slug, secretPath: parentPath })
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
        pathname: "/project/[id]/secrets/[env]",
        query
      });
    }
  };

  const rows = useMemo(() => {
    const filteredSecretNames =
      secKeys
        ?.filter((name) => name.toUpperCase().includes(debouncedSearchFilter.toUpperCase()))
        .sort((a, b) => (sortDir === "asc" ? a.localeCompare(b) : b.localeCompare(a))) ?? [];
    const filteredFolderNames =
      folderNames
        ?.filter((name) => name.toLowerCase().includes(debouncedSearchFilter.toLowerCase()))
        .sort((a, b) => (sortDir === "asc" ? a.localeCompare(b) : b.localeCompare(a))) ?? [];
    const filteredDynamicSecrets =
      dynamicSecretNames
        ?.filter((name) => name.toLowerCase().includes(debouncedSearchFilter.toLowerCase()))
        .sort((a, b) => (sortDir === "asc" ? a.localeCompare(b) : b.localeCompare(a))) ?? [];

    return [
      ...filteredFolderNames.map((name) => ({ name, type: RowType.Folder })),
      ...filteredDynamicSecrets.map((name) => ({ name, type: RowType.DynamicSecret })),
      ...filteredSecretNames.map((name) => ({ name, type: RowType.Secret }))
    ];
  }, [sortDir, debouncedSearchFilter, secKeys, folderNames, dynamicSecretNames]);

  const paginationOffset = (page - 1) * perPage;

  useEffect(() => {
    // reset page if no longer valid
    if (rows.length < paginationOffset) setPage(1);
  }, [rows.length]);

  const isTableLoading =
    folders?.some(({ isLoading }) => isLoading) ||
    secrets?.some(({ isLoading }) => isLoading) ||
    dynamicSecrets?.some(({ isLoading }) => isLoading);

  if (isWorkspaceLoading || isTableLoading) {
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

  const isTableEmpty =
    !(
      folders?.every(({ isLoading }) => isLoading) &&
      secrets?.every(({ isLoading }) => isLoading) &&
      dynamicSecrets?.every(({ isLoading }) => isLoading)
    ) && rows.length === 0;

  return (
    <>
      <div className="container mx-auto px-6 text-mineshaft-50 dark:[color-scheme:dark]">
        <SecretV2MigrationSection />
        <div className="relative right-5 ml-4">
          <NavHeader pageName={t("dashboard.title")} isProjectRelated />
        </div>
        <div className="space-y-8">
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
                      className="flex h-10 w-11 items-center justify-center overflow-hidden border border-mineshaft-600 bg-mineshaft-800 p-0 hover:border-primary/60 hover:bg-primary/10"
                    >
                      <Tooltip content="Choose visible environments" className="mb-2">
                        <FontAwesomeIcon icon={faList} />
                      </Tooltip>
                    </IconButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Choose visible environments</DropdownMenuLabel>
                    {userAvailableEnvs
                      .filter(({ slug }) =>
                        permission.can(
                          ProjectPermissionActions.Read,
                          subject(ProjectPermissionSub.Secrets, {
                            environment: slug,
                            secretPath
                          })
                        )
                      )
                      .map((availableEnv) => {
                        const { id: envId, name } = availableEnv;

                        const isEnvSelected = visibleEnvs.map((env) => env.id).includes(envId);
                        return (
                          <DropdownMenuItem
                            onClick={() => handleEnvSelect(envId)}
                            key={envId}
                            icon={
                              isEnvSelected ? (
                                <FontAwesomeIcon className="text-primary" icon={faCheckCircle} />
                              ) : (
                                <FontAwesomeIcon className="text-mineshaft-400" icon={faCircle} />
                              )
                            }
                            iconPos="left"
                          >
                            <div className="flex items-center">{name}</div>
                          </DropdownMenuItem>
                        );
                      })}
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
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <div className="w-80">
                <Input
                  className="h-[2.3rem] bg-mineshaft-800 placeholder-mineshaft-50 duration-200 focus:bg-mineshaft-700/80"
                  placeholder="Search by secret/folder name..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
                />
              </div>
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
                          a={subject(ProjectPermissionSub.Secrets, { secretPath })}
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
          getSecretByKey={getSecretByKey}
          getFolderByNameAndEnv={getFolderByNameAndEnv}
          selectedEntries={selectedEntries}
          resetSelectedEntries={resetSelectedEntries}
        />
        <div className="thin-scrollbar mt-4" ref={parentTableRef}>
          <TableContainer>
            <Table>
              <THead>
                <Tr className="sticky top-0 z-20 border-0">
                  <Th className="sticky left-0 z-20 min-w-[20rem] border-b-0 p-0">
                    <div className="flex items-center border-b border-r border-mineshaft-600 px-5 pt-3.5 pb-3">
                      Name
                      <IconButton
                        variant="plain"
                        className="ml-2"
                        ariaLabel="sort"
                        onClick={() => setSortDir((prev) => (prev === "asc" ? "desc" : "asc"))}
                      >
                        <FontAwesomeIcon icon={sortDir === "asc" ? faArrowDown : faArrowUp} />
                      </IconButton>
                    </div>
                  </Th>
                  {visibleEnvs?.map(({ name, slug }, index) => {
                    const envSecKeyCount = getEnvSecretKeyCount(slug);
                    const missingKeyCount = secKeys.length - envSecKeyCount;
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
                {canViewOverviewPage && isTableLoading && (
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
                {isTableEmpty && !isTableLoading && visibleEnvs.length > 0 && (
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
                {!isTableLoading &&
                  rows.slice(paginationOffset, paginationOffset + perPage).map((row, index) => {
                    switch (row.type) {
                      case RowType.Secret:
                        if (visibleEnvs?.length === 0) return null;
                        return (
                          <SecretOverviewTableRow
                            isSelected={selectedEntries.secret[row.name]}
                            onToggleSecretSelect={() =>
                              toggleSelectedEntry(EntryType.SECRET, row.name)
                            }
                            secretPath={secretPath}
                            getImportedSecretByKey={getImportedSecretByKey}
                            isImportedSecretPresentInEnv={isImportedSecretPresentInEnv}
                            onSecretCreate={handleSecretCreate}
                            onSecretDelete={handleSecretDelete}
                            onSecretUpdate={handleSecretUpdate}
                            key={`overview-${row.name}-${index + 1}`}
                            environments={visibleEnvs}
                            secretKey={row.name}
                            getSecretByKey={getSecretByKey}
                            expandableColWidth={expandableTableWidth}
                          />
                        );
                      case RowType.DynamicSecret:
                        return (
                          <SecretOverviewDynamicSecretRow
                            dynamicSecretName={row.name}
                            isDynamicSecretInEnv={isDynamicSecretPresentInEnv}
                            environments={visibleEnvs}
                            key={`overview-${row.name}-${index + 1}`}
                          />
                        );
                      case RowType.Folder:
                        return (
                          <SecretOverviewFolderRow
                            folderName={row.name}
                            isFolderPresentInEnv={isFolderPresentInEnv}
                            isSelected={selectedEntries.folder[row.name]}
                            onToggleFolderSelect={() =>
                              toggleSelectedEntry(EntryType.FOLDER, row.name)
                            }
                            environments={visibleEnvs}
                            key={`overview-${row.name}-${index + 1}`}
                            onClick={handleFolderClick}
                            onToggleFolderEdit={(name: string) =>
                              handlePopUpOpen("updateFolder", { name })
                            }
                          />
                        );
                      default:
                        return null;
                    }
                  })}
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
            {!isTableLoading && rows.length > INIT_PER_PAGE && (
              <Pagination
                className="border-t border-solid border-t-mineshaft-600"
                count={rows.length}
                page={page}
                perPage={perPage}
                onChangePage={(newPage) => setPage(newPage)}
                onChangePerPage={(newPerPage) => setPerPage(newPerPage)}
              />
            )}
          </TableContainer>
        </div>
      </div>
      <CreateSecretForm
        secretPath={secretPath}
        isOpen={popUp.addSecretsInAllEnvs.isOpen}
        getSecretByKey={getSecretByKey}
        onTogglePopUp={(isOpen) => handlePopUpToggle("addSecretsInAllEnvs", isOpen)}
        onClose={() => handlePopUpClose("addSecretsInAllEnvs")}
      />
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
