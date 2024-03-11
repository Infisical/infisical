import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import { useRouter } from "next/router";
import { subject } from "@casl/ability";
import { faCheckCircle } from "@fortawesome/free-regular-svg-icons";
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

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import NavHeader from "@app/components/navigation/NavHeader";
import { PermissionDeniedBanner, ProjectPermissionCan } from "@app/components/permissions";
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
import { UpgradeProjectAlert } from "@app/components/v2/UpgradeProjectAlert";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useOrganization,
  useWorkspace
} from "@app/context";
import { usePopUp } from "@app/hooks";
import {
  useCreateFolder,
  useCreateSecretV3,
  useDeleteSecretV3,
  useGetFoldersByEnv,
  useGetProjectSecretsAllEnv,
  useGetUserWsKey,
  useUpdateSecretV3
} from "@app/hooks/api";
import { ProjectVersion } from "@app/hooks/api/workspace/types";

import { FolderForm } from "../SecretMainPage/components/ActionBar/FolderForm";
import { CreateSecretForm } from "./components/CreateSecretForm";
import { FolderBreadCrumbs } from "./components/FolderBreadCrumbs";
import { ProjectIndexSecretsSection } from "./components/ProjectIndexSecretsSection";
import { SecretOverviewFolderRow } from "./components/SecretOverviewFolderRow";
import { SecretOverviewTableRow } from "./components/SecretOverviewTableRow";

export const SecretOverviewPage = () => {
  const { t } = useTranslation();
  const { createNotification } = useNotificationContext();
  const router = useRouter();

  // this is to set expandable table width
  // coz when overflow the table goes to the right
  const parentTableRef = useRef<HTMLTableElement>(null);
  const [expandableTableWidth, setExpandableTableWidth] = useState(0);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    const handleParentTableWidthResize = () => {
      setExpandableTableWidth(parentTableRef.current?.clientWidth || 0);
    };

    window.addEventListener("resize", handleParentTableWidthResize);
    return () => window.removeEventListener("resize", handleParentTableWidthResize);
  }, []);

  useEffect(() => {
    if (parentTableRef.current) {
      setExpandableTableWidth(parentTableRef.current.clientWidth);
    }
  }, [parentTableRef.current]);

  const { currentWorkspace, isLoading: isWorkspaceLoading } = useWorkspace();
  const { currentOrg } = useOrganization();
  const workspaceId = currentWorkspace?.id as string;
  const { data: latestFileKey } = useGetUserWsKey(workspaceId);
  const [searchFilter, setSearchFilter] = useState("");
  const secretPath = (router.query?.secretPath as string) || "/";

  useEffect(() => {
    if (!isWorkspaceLoading && !workspaceId && router.isReady) {
      router.push(`/org/${currentOrg?.id}/overview`);
    }
  }, [isWorkspaceLoading, workspaceId, router.isReady]);

  const userAvailableEnvs = currentWorkspace?.environments || [];
  const [visibleEnvs, setVisisbleEnvs] = useState(userAvailableEnvs);

  const {
    data: secrets,
    getSecretByKey,
    secKeys,
    getEnvSecretKeyCount
  } = useGetProjectSecretsAllEnv({
    workspaceId,
    envs: userAvailableEnvs.map(({ slug }) => slug),
    secretPath,
    decryptFileKey: latestFileKey!
  });
  const { folders, folderNames, isFolderPresentInEnv } = useGetFoldersByEnv({
    projectId: workspaceId,
    path: secretPath,
    environments: userAvailableEnvs.map(({ slug }) => slug)
  });

  const { mutateAsync: createSecretV3 } = useCreateSecretV3();
  const { mutateAsync: updateSecretV3 } = useUpdateSecretV3();
  const { mutateAsync: deleteSecretV3 } = useDeleteSecretV3();
  const { mutateAsync: createFolder } = useCreateFolder();

  const { handlePopUpOpen, handlePopUpToggle, handlePopUpClose, popUp } = usePopUp([
    "addSecretsInAllEnvs",
    "addFolder",
    "misc"
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
        secretName: key,
        secretValue: value,
        secretComment: "",
        type: "shared",
        latestFileKey: latestFileKey!
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
    if (visibleEnvs.map(env => env.id).includes(envId)) {
      setVisisbleEnvs(visibleEnvs.filter(env => env.id !== envId))
    } else {
      setVisisbleEnvs(visibleEnvs.concat(userAvailableEnvs.filter(env => env.id === envId)))
    }
  };

  const handleSecretUpdate = async (env: string, key: string, value: string, secretId?: string) => {
    try {
      await updateSecretV3({
        environment: env,
        workspaceId,
        secretPath,
        secretId,
        secretName: key,
        secretValue: value,
        type: "shared",
        latestFileKey: latestFileKey!
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
        secretName: key,
        secretId,
        type: "shared"
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
      console.log(folderName, parentPath);
      if (folderName && parentPath) {
        await createFolder({
          projectId: workspaceId,
          environment: slug,
          path: parentPath,
          name: folderName
        });
      }
    }
    const query: Record<string, string> = { ...router.query, env: slug };
    const envIndex = visibleEnvs.findIndex((el) => slug === el.slug);
    if (envIndex !== -1) {
      router.push({
        pathname: "/project/[id]/secrets/[env]",
        query
      });
    }
  };

  if (isWorkspaceLoading) {
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

  const isTableLoading = !(
    folders?.some(({ isLoading }) => !isLoading) && secrets?.some(({ isLoading }) => !isLoading)
  );

  const canViewOverviewPage = Boolean(userAvailableEnvs.length);
  const filteredSecretNames = secKeys
    ?.filter((name) => name.toUpperCase().includes(searchFilter.toUpperCase()))
    .sort((a, b) => (sortDir === "asc" ? a.localeCompare(b) : b.localeCompare(a)));
  const filteredFolderNames = folderNames?.filter((name) =>
    name.toLowerCase().includes(searchFilter.toLowerCase())
  );
  const isTableEmpty =
    !(
      folders?.every(({ isLoading }) => isLoading) && secrets?.every(({ isLoading }) => isLoading)
    ) &&
    filteredSecretNames?.length === 0 &&
    filteredFolderNames?.length === 0;

  return (
    <>
      <div className="container mx-auto px-6 text-mineshaft-50 dark:[color-scheme:dark]">
        <ProjectIndexSecretsSection decryptFileKey={latestFileKey!} />
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

          {currentWorkspace?.version === ProjectVersion.V1 && (
            <UpgradeProjectAlert project={currentWorkspace} />
          )}

          <div className="flex items-center justify-between">
            <FolderBreadCrumbs secretPath={secretPath} onResetSearch={handleResetSearch} />
            <div className="flex flex-row items-center justify-center space-x-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <IconButton
                    ariaLabel="Environments"
                    variant="plain"
                    size="sm"
                    className="flex justify-center items-center overflow-hidden p-0 w-11 bg-mineshaft-800 hover:bg-primary/10 hover:border-primary/60 border border-mineshaft-600 mr-2"
                  >
                    <Tooltip content="Choose visible environments" className="mb-2">
                      <FontAwesomeIcon icon={faList} />
                    </Tooltip>
                  </IconButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Choose visible environments</DropdownMenuLabel>
                  {userAvailableEnvs.map((avaiableEnv) => {
                    const { id: envId, name } = avaiableEnv;

                    const isEnvSelected = visibleEnvs.map(env => env.id).includes(envId);
                    return (
                      <DropdownMenuItem
                        onClick={() => handleEnvSelect(envId)}
                        key={envId}
                        icon={isEnvSelected && <FontAwesomeIcon className="text-primary" icon={faCheckCircle} />}
                        iconPos="left"
                      >
                        <div className="flex items-center">
                          {name}
                        </div>
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
              <div className="w-80">
                <Input
                  className="h-[2.3rem] bg-mineshaft-800 placeholder-mineshaft-50 duration-200 focus:bg-mineshaft-700/80"
                  placeholder="Search by secret/folder name..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
                />
              </div>
              <div>
                <ProjectPermissionCan
                  I={ProjectPermissionActions.Create}
                  a={subject(ProjectPermissionSub.Secrets, { secretPath })}
                >
                  {(isAllowed) => (
                    <Button
                      variant="outline_bg"
                      leftIcon={<FontAwesomeIcon icon={faPlus} />}
                      onClick={() => handlePopUpOpen("addSecretsInAllEnvs")}
                      className="h-10 rounded-r-none"
                      isDisabled={!isAllowed}
                    >
                      Add Secret
                    </Button>
                  )}
                </ProjectPermissionCan>
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
            </div>
          </div>
        </div>
        <div className="thin-scrollbar mt-4" ref={parentTableRef}>
          <TableContainer className="max-h-[calc(100vh-250px)] overflow-y-auto">
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
                {isTableEmpty && !isTableLoading && (
                  <Tr>
                    <Td colSpan={visibleEnvs.length + 1}>
                      <EmptyState title="Let's add some secrets" icon={faFolderBlank} iconSize="3x">
                        <Link
                          href={{
                            pathname: "/project/[id]/secrets/[env]",
                            query: { id: workspaceId, env: visibleEnvs?.[0]?.slug }
                          }}
                        >
                          <Button
                            className="mt-4"
                            variant="outline_bg"
                            colorSchema="primary"
                            size="md"
                          >
                            Go to {visibleEnvs?.[0]?.name}
                          </Button>
                        </Link>
                      </EmptyState>
                    </Td>
                  </Tr>
                )}
                {!isTableLoading &&
                  filteredFolderNames.map((folderName, index) => (
                    <SecretOverviewFolderRow
                      folderName={folderName}
                      isFolderPresentInEnv={isFolderPresentInEnv}
                      environments={visibleEnvs}
                      key={`overview-${folderName}-${index + 1}`}
                      onClick={handleFolderClick}
                    />
                  ))}
                {!isTableLoading &&
                  (visibleEnvs?.length > 0 ? (
                    filteredSecretNames.map((key, index) => (
                      <SecretOverviewTableRow
                        secretPath={secretPath}
                        onSecretCreate={handleSecretCreate}
                        onSecretDelete={handleSecretDelete}
                        onSecretUpdate={handleSecretUpdate}
                        key={`overview-${key}-${index + 1}`}
                        environments={visibleEnvs}
                        secretKey={key}
                        getSecretByKey={getSecretByKey}
                        expandableColWidth={expandableTableWidth}
                      />
                    ))
                  ) : (
                    <PermissionDeniedBanner />
                  ))}
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
        </div>
      </div>
      <CreateSecretForm
        secretPath={secretPath}
        isOpen={popUp.addSecretsInAllEnvs.isOpen}
        getSecretByKey={getSecretByKey}
        onTogglePopUp={(isOpen) => handlePopUpToggle("addSecretsInAllEnvs", isOpen)}
        onClose={() => handlePopUpClose("addSecretsInAllEnvs")}
        decryptFileKey={latestFileKey!}
      />
      <Modal
        isOpen={popUp.addFolder.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("addFolder", isOpen)}
      >
        <ModalContent title="Create Folder">
          <FolderForm onCreateFolder={handleFolderCreate} />
        </ModalContent>
      </Modal>
    </>
  );
};
