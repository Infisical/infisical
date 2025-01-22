// REFACTOR(akhilmhdh): This file needs to be split into multiple components too complex
import { ReactNode, useMemo, useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { faFolderOpen, faStar } from "@fortawesome/free-regular-svg-icons";
import {
  faArrowDownAZ,
  faArrowRight,
  faArrowUpZA,
  faBorderAll,
  faExclamationCircle,
  faList,
  faMagnifyingGlass,
  faPlus,
  faSearch,
  faStar as faSolidStar
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { NewProjectModal } from "@app/components/projects";
import {
  Button,
  IconButton,
  Input,
  PageHeader,
  Pagination,
  Skeleton,
  Tooltip
} from "@app/components/v2";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  useOrganization,
  useSubscription
} from "@app/context";
import { getProjectHomePage } from "@app/helpers/project";
import { usePagination, useResetPageHelper } from "@app/hooks";
import { useGetUserWorkspaces } from "@app/hooks/api";
import { OrderByDirection } from "@app/hooks/api/generic/types";
// import { fetchUserWsKey } from "@app/hooks/api/keys/queries";
import { useFetchServerStatus } from "@app/hooks/api/serverDetails";
import { Workspace } from "@app/hooks/api/types";
import { useUpdateUserProjectFavorites } from "@app/hooks/api/users/mutation";
import { useGetUserProjectFavorites } from "@app/hooks/api/users/queries";
import { ProjectType } from "@app/hooks/api/workspace/types";
import { usePopUp } from "@app/hooks/usePopUp";

enum ProjectsViewMode {
  GRID = "grid",
  LIST = "list"
}

enum ProjectOrderBy {
  Name = "name"
}

const formatDescription = (type: ProjectType) => {
  if (type === ProjectType.SecretManager)
    return "Securely store, manage, and rotate various application secrets, such as database credentials, API keys, etc.";
  if (type === ProjectType.CertificateManager)
    return "Manage your PKI infrastructure and issue digital certificates for services, applications, and devices.";
  if (type === ProjectType.KMS)
    return "Centralize the management of keys for cryptographic operations, such as encryption and decryption.";
  return "Generate SSH credentials to provide secure and centralized SSH access control for your infrastructure.";
};

type Props = {
  type: ProjectType;
};

// #TODO: Update all the workspaceIds
export const ProductOverviewPage = ({ type }: Props) => {
  const { t } = useTranslation();

  const navigate = useNavigate();

  const { data: workspaces, isPending: isWorkspaceLoading } = useGetUserWorkspaces({ type });
  const { currentOrg } = useOrganization();
  const orgWorkspaces = workspaces || [];
  const { data: projectFavorites, isPending: isProjectFavoritesLoading } =
    useGetUserProjectFavorites(currentOrg?.id);
  const { mutateAsync: updateUserProjectFavorites } = useUpdateUserProjectFavorites();

  const isProjectViewLoading = isWorkspaceLoading || isProjectFavoritesLoading;

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "addNewWs",
    "upgradePlan"
  ] as const);

  const [searchFilter, setSearchFilter] = useState("");
  const { data: serverDetails } = useFetchServerStatus();
  const [projectsViewMode, setProjectsViewMode] = useState<ProjectsViewMode>(
    (localStorage.getItem("projectsViewMode") as ProjectsViewMode) || ProjectsViewMode.GRID
  );

  const { subscription } = useSubscription();

  const isAddingProjectsAllowed = subscription?.workspaceLimit
    ? subscription.workspacesUsed < subscription.workspaceLimit
    : true;

  const isWorkspaceEmpty = !isProjectViewLoading && orgWorkspaces?.length === 0;

  const {
    setPage,
    perPage,
    setPerPage,
    page,
    offset,
    limit,
    toggleOrderDirection,
    orderDirection
  } = usePagination(ProjectOrderBy.Name, { initPerPage: 24 });

  const filteredWorkspaces = useMemo(
    () =>
      orgWorkspaces
        .filter((ws) => ws?.name?.toLowerCase().includes(searchFilter.toLowerCase()))
        .sort((a, b) =>
          orderDirection === OrderByDirection.ASC
            ? a.name.toLowerCase().localeCompare(b.name.toLowerCase())
            : b.name.toLowerCase().localeCompare(a.name.toLowerCase())
        ),
    [searchFilter, orderDirection, orgWorkspaces]
  );

  useResetPageHelper({
    setPage,
    offset,
    totalCount: filteredWorkspaces.length
  });

  const { workspacesWithFaveProp } = useMemo(() => {
    const workspacesWithFav = filteredWorkspaces
      .map((w): Workspace & { isFavorite: boolean } => ({
        ...w,
        isFavorite: Boolean(projectFavorites?.includes(w.id))
      }))
      .sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite))
      .slice(offset, limit * page);

    return {
      workspacesWithFaveProp: workspacesWithFav
    };
  }, [filteredWorkspaces, projectFavorites, offset, limit, page]);

  const addProjectToFavorites = async (projectId: string) => {
    try {
      if (currentOrg?.id) {
        await updateUserProjectFavorites({
          orgId: currentOrg?.id,
          projectFavorites: [...(projectFavorites || []), projectId]
        });
      }
    } catch {
      createNotification({
        text: "Failed to add project to favorites.",
        type: "error"
      });
    }
  };

  const removeProjectFromFavorites = async (projectId: string) => {
    try {
      if (currentOrg?.id) {
        await updateUserProjectFavorites({
          orgId: currentOrg?.id,
          projectFavorites: [...(projectFavorites || []).filter((entry) => entry !== projectId)]
        });
      }
    } catch {
      createNotification({
        text: "Failed to remove project from favorites.",
        type: "error"
      });
    }
  };

  const renderProjectGridItem = (workspace: Workspace, isFavorite: boolean) => (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
    <div
      onClick={() => {
        navigate({
          to: getProjectHomePage(workspace),
          params: {
            projectId: workspace.id
          }
        });
      }}
      key={workspace.id}
      className="flex h-40 min-w-72 cursor-pointer flex-col rounded-md border border-mineshaft-600 bg-mineshaft-800 p-4"
    >
      <div className="flex flex-row justify-between">
        <div className="mt-0 truncate text-lg text-mineshaft-100">{workspace.name}</div>
        {isFavorite ? (
          <FontAwesomeIcon
            icon={faSolidStar}
            className="text-sm text-yellow-600 hover:text-mineshaft-400"
            onClick={(e) => {
              e.stopPropagation();
              removeProjectFromFavorites(workspace.id);
            }}
          />
        ) : (
          <FontAwesomeIcon
            icon={faStar}
            className="text-sm text-mineshaft-400 hover:text-mineshaft-300"
            onClick={(e) => {
              e.stopPropagation();
              addProjectToFavorites(workspace.id);
            }}
          />
        )}
      </div>

      <div
        className="mb-2.5 mt-1 grow text-sm text-mineshaft-300"
        style={{
          overflow: "hidden",
          display: "-webkit-box",
          WebkitBoxOrient: "vertical",
          WebkitLineClamp: 2
        }}
      >
        {workspace.description}
      </div>

      <div className="flex w-full flex-row items-end justify-between place-self-end">
        {type === ProjectType.SecretManager && (
          <div className="mt-0 text-xs text-mineshaft-400">
            {workspace.environments?.length || 0} environments
          </div>
        )}
        <button type="button">
          <div className="group ml-auto w-max cursor-pointer rounded-full border border-mineshaft-600 bg-mineshaft-900 px-4 py-2 text-sm text-mineshaft-300 transition-all hover:border-primary-500/80 hover:bg-primary-800/20 hover:text-mineshaft-200">
            Explore{" "}
            <FontAwesomeIcon
              icon={faArrowRight}
              className="pl-1.5 pr-0.5 duration-200 hover:pl-2 hover:pr-0"
            />
          </div>
        </button>
      </div>
    </div>
  );

  const renderProjectListItem = (workspace: Workspace, isFavorite: boolean, index: number) => (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
    <div
      onClick={() => {
        navigate({
          to: getProjectHomePage(workspace),
          params: {
            projectId: workspace.id
          }
        });
      }}
      key={workspace.id}
      className={`group grid h-14 min-w-72 cursor-pointer grid-cols-6 border-l border-r border-t border-mineshaft-600 bg-mineshaft-800 px-6 hover:bg-mineshaft-700 ${
        index === 0 && "rounded-t-md"
      }`}
    >
      <div className="flex items-center sm:col-span-3 lg:col-span-4">
        <div className="truncate text-sm text-mineshaft-100">{workspace.name}</div>
      </div>
      <div className="flex items-center justify-end sm:col-span-3 lg:col-span-2">
        <div className="text-center text-sm text-mineshaft-300">
          {workspace.environments?.length || 0} environments
        </div>
        {isFavorite ? (
          <FontAwesomeIcon
            icon={faSolidStar}
            className="ml-6 text-sm text-yellow-600 hover:text-mineshaft-400"
            onClick={(e) => {
              e.stopPropagation();
              removeProjectFromFavorites(workspace.id);
            }}
          />
        ) : (
          <FontAwesomeIcon
            icon={faStar}
            className="ml-6 text-sm text-mineshaft-400 hover:text-mineshaft-300"
            onClick={(e) => {
              e.stopPropagation();
              addProjectToFavorites(workspace.id);
            }}
          />
        )}
      </div>
    </div>
  );

  let projectsComponents: ReactNode;

  if (filteredWorkspaces.length || isProjectViewLoading) {
    switch (projectsViewMode) {
      case ProjectsViewMode.GRID:
        projectsComponents = (
          <div className="mt-4 grid w-full grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {isProjectViewLoading &&
              Array.apply(0, Array(3)).map((_x, i) => (
                <div
                  key={`workspace-cards-loading-${i + 1}`}
                  className="flex h-40 min-w-72 flex-col justify-between rounded-md border border-mineshaft-600 bg-mineshaft-800 p-4"
                >
                  <div className="mt-0 text-lg text-mineshaft-100">
                    <Skeleton className="w-3/4 bg-mineshaft-600" />
                  </div>
                  <div className="mt-0 pb-6 text-sm text-mineshaft-300">
                    <Skeleton className="w-1/2 bg-mineshaft-600" />
                  </div>
                  <div className="flex justify-end">
                    <Skeleton className="w-1/2 bg-mineshaft-600" />
                  </div>
                </div>
              ))}
            {!isProjectViewLoading && (
              <>
                {workspacesWithFaveProp.map((workspace) =>
                  renderProjectGridItem(workspace, workspace.isFavorite)
                )}
              </>
            )}
          </div>
        );

        break;
      case ProjectsViewMode.LIST:
      default:
        projectsComponents = (
          <div className="mt-4 w-full rounded-md">
            {isProjectViewLoading &&
              Array.apply(0, Array(3)).map((_x, i) => (
                <div
                  key={`workspace-cards-loading-${i + 1}`}
                  className={`group flex h-12 min-w-72 cursor-pointer flex-row items-center justify-between border border-mineshaft-600 bg-mineshaft-800 px-6 hover:bg-mineshaft-700 ${
                    i === 0 && "rounded-t-md"
                  } ${i === 2 && "rounded-b-md border-b"}`}
                >
                  <Skeleton className="w-full bg-mineshaft-600" />
                </div>
              ))}
            {!isProjectViewLoading &&
              workspacesWithFaveProp.map((workspace, ind) =>
                renderProjectListItem(workspace, workspace.isFavorite, ind)
              )}
          </div>
        );
        break;
    }
  } else if (orgWorkspaces.length && searchFilter) {
    projectsComponents = (
      <div className="mt-4 w-full rounded-md border border-mineshaft-700 bg-mineshaft-800 px-4 py-6 text-base text-mineshaft-300">
        <FontAwesomeIcon
          icon={faSearch}
          className="mb-4 mt-2 w-full text-center text-5xl text-mineshaft-400"
        />
        <div className="text-center font-light">No projects match search...</div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col justify-start bg-bunker-800">
      <Helmet>
        <title>{t("common.head-title", { title: t("settings.members.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      {!serverDetails?.redisConfigured && (
        <div className="mb-4 flex flex-col items-start justify-start text-3xl">
          <p className="mb-4 mr-4 font-semibold text-white">Announcements</p>
          <div className="flex w-full items-center rounded-md border border-blue-400/70 bg-blue-900/70 p-2 text-base text-mineshaft-100">
            <FontAwesomeIcon
              icon={faExclamationCircle}
              className="mr-4 p-4 text-2xl text-mineshaft-50"
            />
            Attention: Updated versions of Infisical now require Redis for full functionality. Learn
            how to configure it
            <a
              href="https://infisical.com/docs/self-hosting/configuration/redis"
              rel="noopener noreferrer"
              target="_blank"
            >
              <span className="cursor-pointer pl-1 text-white underline underline-offset-2 duration-100 hover:text-blue-200 hover:decoration-blue-400">
                here
              </span>
            </a>
            .
          </div>
        </div>
      )}
      <div className="mb-4 flex flex-col items-start justify-start">
        <PageHeader title="Projects" description={formatDescription(type)} />
        <div className="flex w-full flex-row">
          <Input
            className="h-[2.3rem] bg-mineshaft-800 text-sm placeholder-mineshaft-50 duration-200 focus:bg-mineshaft-700/80"
            placeholder="Search by project name..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
          />
          <div className="ml-2 flex rounded-md border border-mineshaft-600 bg-mineshaft-800 p-1">
            <Tooltip content="Toggle Sort Direction">
              <IconButton
                className="min-w-[2.4rem] border-none hover:bg-mineshaft-600"
                ariaLabel={`Sort ${
                  orderDirection === OrderByDirection.ASC ? "descending" : "ascending"
                }`}
                variant="plain"
                size="xs"
                colorSchema="secondary"
                onClick={toggleOrderDirection}
              >
                <FontAwesomeIcon
                  icon={orderDirection === OrderByDirection.ASC ? faArrowDownAZ : faArrowUpZA}
                />
              </IconButton>
            </Tooltip>
          </div>
          <div className="ml-2 flex rounded-md border border-mineshaft-600 bg-mineshaft-800 p-1">
            <IconButton
              variant="outline_bg"
              onClick={() => {
                localStorage.setItem("projectsViewMode", ProjectsViewMode.GRID);
                setProjectsViewMode(ProjectsViewMode.GRID);
              }}
              ariaLabel="grid"
              size="xs"
              className={`${
                projectsViewMode === ProjectsViewMode.GRID ? "bg-mineshaft-500" : "bg-transparent"
              } min-w-[2.4rem] border-none hover:bg-mineshaft-600`}
            >
              <FontAwesomeIcon icon={faBorderAll} />
            </IconButton>
            <IconButton
              variant="outline_bg"
              onClick={() => {
                localStorage.setItem("projectsViewMode", ProjectsViewMode.LIST);
                setProjectsViewMode(ProjectsViewMode.LIST);
              }}
              ariaLabel="list"
              size="xs"
              className={`${
                projectsViewMode === ProjectsViewMode.LIST ? "bg-mineshaft-500" : "bg-transparent"
              } min-w-[2.4rem] border-none hover:bg-mineshaft-600`}
            >
              <FontAwesomeIcon icon={faList} />
            </IconButton>
          </div>
          <OrgPermissionCan I={OrgPermissionActions.Create} an={OrgPermissionSubjects.Workspace}>
            {(isAllowed) => (
              <Button
                isDisabled={!isAllowed}
                colorSchema="primary"
                leftIcon={<FontAwesomeIcon icon={faPlus} />}
                onClick={() => {
                  if (isAddingProjectsAllowed) {
                    handlePopUpOpen("addNewWs");
                  } else {
                    handlePopUpOpen("upgradePlan");
                  }
                }}
                className="ml-2"
              >
                Add New Project
              </Button>
            )}
          </OrgPermissionCan>
        </div>
        {projectsComponents}
        {!isProjectViewLoading && Boolean(filteredWorkspaces.length) && (
          <Pagination
            className={
              projectsViewMode === ProjectsViewMode.GRID
                ? "col-span-full !justify-start border-transparent bg-transparent pl-2"
                : "rounded-b-md border border-mineshaft-600"
            }
            perPage={perPage}
            perPageList={[12, 24, 48, 96]}
            count={filteredWorkspaces.length}
            page={page}
            onChangePage={setPage}
            onChangePerPage={setPerPage}
          />
        )}
        {isWorkspaceEmpty && (
          <div className="mt-4 w-full rounded-md border border-mineshaft-700 bg-mineshaft-800 px-4 py-6 text-base text-mineshaft-300">
            <FontAwesomeIcon
              icon={faFolderOpen}
              className="mb-4 mt-2 w-full text-center text-5xl text-mineshaft-400"
            />
            <div className="text-center font-light">
              You are not part of any projects in this organization yet. When you are, they will
              appear here.
            </div>
            <div className="mt-0.5 text-center font-light">
              Create a new project, or ask other organization members to give you necessary
              permissions.
            </div>
          </div>
        )}
      </div>
      <NewProjectModal
        isOpen={popUp.addNewWs.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("addNewWs", isOpen)}
        projectType={type}
      />
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text="You have exceeded the number of projects allowed on the free plan."
      />
    </div>
  );
};

export const SecretManagerOverviewPage = () => (
  <ProductOverviewPage type={ProjectType.SecretManager} />
);
