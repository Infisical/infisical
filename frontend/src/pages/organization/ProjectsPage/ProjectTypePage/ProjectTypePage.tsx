/* eslint-disable @typescript-eslint/no-use-before-define */
import { ReactNode, useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet";
import { faStar } from "@fortawesome/free-regular-svg-icons";
import {
  faArrowDownAZ,
  faArrowUpZA,
  faBorderAll,
  faList,
  faMagnifyingGlass,
  faPlus,
  faSearch,
  faStar as faSolidStar
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { CheckIcon, ChevronLeftIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { OrgPermissionCan } from "@app/components/permissions";
import { NewProjectModal } from "@app/components/projects";
import { RequestProjectAccessModal } from "@app/components/projects/RequestProjectAccessModal";
import {
  Button,
  IconButton,
  Input,
  Lottie,
  Pagination,
  Skeleton,
  Tooltip
} from "@app/components/v2";
import { Badge } from "@app/components/v3";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  useOrganization,
  useSubscription
} from "@app/context";
import { OrgPermissionAdminConsoleAction } from "@app/context/OrgPermissionContext/types";
import {
  getProjectDescription,
  getProjectHomePage,
  getProjectLottieIcon,
  getProjectTitle,
  urlSlugToProjectType
} from "@app/helpers/project";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { useDebounce, usePagination, usePopUp, useResetPageHelper } from "@app/hooks";
import { useGetUserProjects, useOrgAdminAccessProject, useSearchProjects } from "@app/hooks/api";
import { useCertManagerInstanceState } from "@app/hooks/api/certManagerInstance";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { Project, ProjectEnv, ProjectType } from "@app/hooks/api/projects/types";
import { useUpdateUserProjectFavorites } from "@app/hooks/api/users/mutation";
import { useGetUserProjectFavorites } from "@app/hooks/api/users/queries";
import {
  ProjectListToggle,
  ProjectListView
} from "@app/pages/organization/ProjectsPage/components/ProjectListToggle";

enum ProjectsViewMode {
  GRID = "grid",
  LIST = "list"
}

export const ProjectTypePage = () => {
  const navigate = useNavigate();
  const { orgId, type: typeSlug } = useParams({
    from: "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/$type"
  });
  const projectType = urlSlugToProjectType(typeSlug) ?? (typeSlug as ProjectType);

  const { data: certManagerInstance } = useCertManagerInstanceState();

  useEffect(() => {
    if (projectType === ProjectType.CertificateManager) {
      if (certManagerInstance?.activeProjectId) {
        navigate({
          to: "/organizations/$orgId/projects/cert-manager/$projectId/overview",
          params: { orgId, projectId: certManagerInstance.activeProjectId }
        });
      } else if (certManagerInstance && !certManagerInstance.activeProjectId) {
        navigate({
          to: "/organizations/$orgId/projects",
          params: { orgId }
        });
      }
    }
  }, [projectType, certManagerInstance, orgId, navigate]);

  if (projectType === ProjectType.CertificateManager) {
    return null;
  }

  return <ProjectTypeContent projectType={projectType} orgId={orgId} />;
};

const ProjectTypeContent = ({
  projectType,
  orgId
}: {
  projectType: ProjectType;
  orgId: string;
}) => {
  const { subscription } = useSubscription();
  const isAddingProjectsAllowed = subscription?.workspaceLimit
    ? subscription.workspacesUsed < subscription.workspaceLimit
    : true;

  const [projectListView, setProjectListView] = useState<ProjectListView>(() => {
    const storedView = localStorage.getItem("projectListView");
    if (
      storedView &&
      (storedView === ProjectListView.AllProjects || storedView === ProjectListView.MyProjects)
    ) {
      return storedView;
    }
    return ProjectListView.MyProjects;
  });

  const handleSetProjectListView = (value: ProjectListView) => {
    localStorage.setItem("projectListView", value);
    setProjectListView(value);
  };

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "addNewWs",
    "upgradePlan",
    "requestAccessConfirmation"
  ] as const);

  const typeTitle = getProjectTitle(projectType);

  return (
    <div className="mx-auto flex max-w-8xl flex-col">
      <Helmet>
        <title>{typeTitle} Projects</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <Link
        to="/organizations/$orgId/projects"
        params={{ orgId }}
        className="mb-4 flex w-fit items-center gap-x-1 text-sm text-mineshaft-400 transition duration-100 hover:text-mineshaft-400/80"
      >
        <ChevronLeftIcon size={16} />
        Overview
      </Link>
      <div className="mb-10">
        <h1 className="flex items-center text-2xl font-medium text-white underline decoration-project/90 underline-offset-4">
          <Lottie
            icon={getProjectLottieIcon(projectType)}
            className="mr-3 h-[26px] w-[26px] shrink-0"
          />
          {typeTitle}
        </h1>
        <div className="mt-1.5 text-mineshaft-300">{getProjectDescription(projectType)}</div>
      </div>
      {projectListView === ProjectListView.MyProjects ? (
        <MyProjectsForType
          projectType={projectType}
          projectListView={projectListView}
          onProjectListViewChange={handleSetProjectListView}
          onAddNewProject={() => handlePopUpOpen("addNewWs")}
          onUpgradePlan={() => handlePopUpOpen("upgradePlan")}
          isAddingProjectsAllowed={isAddingProjectsAllowed}
        />
      ) : (
        <AllProjectsForType
          projectType={projectType}
          projectListView={projectListView}
          onProjectListViewChange={handleSetProjectListView}
          onAddNewProject={() => handlePopUpOpen("addNewWs")}
          onUpgradePlan={() => handlePopUpOpen("upgradePlan")}
          isAddingProjectsAllowed={isAddingProjectsAllowed}
        />
      )}
      <NewProjectModal
        isOpen={popUp.addNewWs.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("addNewWs", isOpen)}
        projectType={projectType}
      />
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text="You have reached the maximum number of projects allowed on your current plan. Upgrade to Infisical Pro plan to add more projects."
      />
    </div>
  );
};

type SubViewProps = {
  projectType: ProjectType;
  projectListView: ProjectListView;
  onProjectListViewChange: (value: ProjectListView) => void;
  onAddNewProject: () => void;
  onUpgradePlan: () => void;
  isAddingProjectsAllowed: boolean;
};

const MyProjectsForType = ({
  projectType,
  projectListView,
  onProjectListViewChange,
  onAddNewProject,
  onUpgradePlan,
  isAddingProjectsAllowed
}: SubViewProps) => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const [searchFilter, setSearchFilter] = useState("");
  const [projectsViewMode, setProjectsViewMode] = useState<ProjectsViewMode>(
    (localStorage.getItem("projectsViewMode") as ProjectsViewMode) || ProjectsViewMode.GRID
  );

  const { data: rawWorkspaces = [], isPending: isWorkspaceLoading } = useGetUserProjects();
  const workspaces = useMemo(
    () => rawWorkspaces.filter((w) => w.type === projectType),
    [rawWorkspaces, projectType]
  );

  const {
    setPage,
    perPage,
    setPerPage,
    page,
    offset,
    limit,
    toggleOrderDirection,
    orderDirection
  } = usePagination("name", {
    initPerPage: getUserTablePreference("myProjectsTable", PreferenceKey.PerPage, 24)
  });

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference("myProjectsTable", PreferenceKey.PerPage, newPerPage);
  };

  const { data: projectFavorites, isPending: isProjectFavoritesLoading } =
    useGetUserProjectFavorites(currentOrg?.id);
  const { mutateAsync: updateUserProjectFavorites } = useUpdateUserProjectFavorites();

  const isProjectViewLoading = isWorkspaceLoading || isProjectFavoritesLoading;

  const filteredWorkspaces = useMemo(
    () =>
      workspaces
        .filter((ws) => ws?.name?.toLowerCase().includes(searchFilter.toLowerCase()))
        .sort((a, b) =>
          orderDirection === OrderByDirection.ASC
            ? a.name.toLowerCase().localeCompare(b.name.toLowerCase())
            : b.name.toLowerCase().localeCompare(a.name.toLowerCase())
        ),
    [searchFilter, orderDirection, workspaces]
  );

  useResetPageHelper({
    setPage,
    offset,
    totalCount: filteredWorkspaces.length
  });

  const workspacesWithFaveProp = useMemo(
    () =>
      filteredWorkspaces
        .map((w): Project & { isFavorite: boolean } => ({
          ...w,
          isFavorite: Boolean(projectFavorites?.includes(w.id))
        }))
        .sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite))
        .slice(offset, limit * page),
    [filteredWorkspaces, projectFavorites, offset, limit, page]
  );

  const addProjectToFavorites = async (projectId: string) => {
    if (currentOrg?.id) {
      await updateUserProjectFavorites({
        orgId: currentOrg.id,
        projectFavorites: [...(projectFavorites || []), projectId]
      });
    }
  };

  const removeProjectFromFavorites = async (projectId: string) => {
    if (currentOrg?.id) {
      await updateUserProjectFavorites({
        orgId: currentOrg.id,
        projectFavorites: (projectFavorites || []).filter((entry) => entry !== projectId)
      });
    }
  };

  const navigateToProject = (workspace: Project) => {
    navigate({
      to: getProjectHomePage(workspace.type, workspace.environments),
      params: { orgId: currentOrg?.id || "", projectId: workspace.id }
    });
  };

  const renderProjectGridItem = (workspace: Project & { isFavorite: boolean }) => (
    <div
      onClick={() => navigateToProject(workspace)}
      key={workspace.id}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") navigateToProject(workspace);
      }}
      className="cursor-pointer overflow-clip rounded-sm border border-l-4 border-mineshaft-600 border-l-mineshaft-400 bg-mineshaft-800 p-4 transition-transform duration-100 hover:scale-[103%] hover:border-l-primary hover:bg-mineshaft-700"
    >
      <div className="flex items-center gap-4">
        <div className="rounded-sm border border-mineshaft-500 bg-mineshaft-600 p-1.5 shadow-inner">
          <Lottie className="h-7 w-7 shrink-0" icon={getProjectLottieIcon(workspace.type)} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-medium text-mineshaft-100">{workspace.name}</p>
          <p className="truncate text-sm leading-4 text-mineshaft-300">
            {getProjectTitle(workspace.type)}
          </p>
        </div>
        <div className="mt-0.5 self-start">
          {workspace.isFavorite ? (
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
      </div>
      <p className="mt-4 truncate text-sm text-mineshaft-400">
        {workspace.description || "No description"}
      </p>
    </div>
  );

  const renderProjectListItem = (workspace: Project & { isFavorite: boolean }, index: number) => (
    <div
      onClick={() => navigateToProject(workspace)}
      key={workspace.id}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") navigateToProject(workspace);
      }}
      className={`group flex min-w-72 cursor-pointer border-t border-r border-l border-mineshaft-600 bg-mineshaft-800 px-6 py-3 hover:bg-mineshaft-700 ${
        index === 0 && "rounded-t-md"
      }`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="rounded-sm border border-mineshaft-500 bg-mineshaft-600 p-1 shadow-inner">
          <Lottie
            className="h-[1.35rem] w-[1.35rem] shrink-0"
            icon={getProjectLottieIcon(workspace.type)}
          />
        </div>
        <div className="-mt-0.5 flex min-w-0 flex-col">
          <p className="truncate text-sm text-mineshaft-100">{workspace.name}</p>
          <p className="truncate text-xs leading-4 text-mineshaft-300">
            {getProjectTitle(workspace.type)}{" "}
            {workspace.description ? `- ${workspace.description}` : ""}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-end">
        {workspace.isFavorite ? (
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
          <div className="mt-4 grid w-full grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3">
            {isProjectViewLoading &&
              Array.apply(0, Array(3)).map((_x, i) => (
                <div
                  key={`workspace-cards-loading-${i + 1}`}
                  className="flex h-40 min-w-72 flex-col justify-between rounded-md border border-mineshaft-600 bg-mineshaft-800 p-4"
                >
                  <Skeleton className="w-3/4 bg-mineshaft-600" />
                  <Skeleton className="w-1/2 bg-mineshaft-600" />
                </div>
              ))}
            {!isProjectViewLoading &&
              workspacesWithFaveProp.map((workspace) => renderProjectGridItem(workspace))}
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
              workspacesWithFaveProp.map((workspace, ind) => renderProjectListItem(workspace, ind))}
          </div>
        );
        break;
    }
  } else if (workspaces.length && searchFilter) {
    projectsComponents = (
      <div className="mt-4 w-full rounded-md border border-mineshaft-700 bg-mineshaft-800 px-4 py-6 text-base text-mineshaft-300">
        <FontAwesomeIcon
          icon={faSearch}
          className="mt-2 mb-4 w-full text-center text-5xl text-mineshaft-400"
        />
        <div className="text-center font-light">No projects match search...</div>
      </div>
    );
  }

  const isWorkspaceEmpty = !isProjectViewLoading && workspaces.length === 0;

  return (
    <div>
      <Toolbar
        searchFilter={searchFilter}
        onSearchChange={setSearchFilter}
        orderDirection={orderDirection}
        onToggleOrderDirection={toggleOrderDirection}
        projectsViewMode={projectsViewMode}
        onViewModeChange={(mode) => {
          localStorage.setItem("projectsViewMode", mode);
          setProjectsViewMode(mode);
        }}
        projectListView={projectListView}
        onProjectListViewChange={onProjectListViewChange}
        onAddNewProject={onAddNewProject}
        onUpgradePlan={onUpgradePlan}
        isAddingProjectsAllowed={isAddingProjectsAllowed}
      />
      {projectsComponents}
      {!isProjectViewLoading && Boolean(filteredWorkspaces.length) && (
        <Pagination
          className={
            projectsViewMode === ProjectsViewMode.GRID
              ? "col-span-full justify-start! border-transparent bg-transparent pl-2"
              : "rounded-b-md border border-mineshaft-600"
          }
          perPage={perPage}
          perPageList={[12, 24, 48, 96]}
          count={filteredWorkspaces.length}
          page={page}
          onChangePage={setPage}
          onChangePerPage={handlePerPageChange}
        />
      )}
      {isWorkspaceEmpty && (
        <EmptyState
          projectType={projectType}
          onAddNewProject={onAddNewProject}
          onUpgradePlan={onUpgradePlan}
          isAddingProjectsAllowed={isAddingProjectsAllowed}
        />
      )}
    </div>
  );
};

const AllProjectsForType = ({
  projectType,
  projectListView,
  onProjectListViewChange,
  onAddNewProject,
  onUpgradePlan,
  isAddingProjectsAllowed
}: SubViewProps) => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const [searchFilter, setSearchFilter] = useState("");
  const [debouncedSearch] = useDebounce(searchFilter);

  const {
    setPage,
    perPage,
    setPerPage,
    page,
    offset,
    limit,
    toggleOrderDirection,
    orderDirection
  } = usePagination("name", {
    initPerPage: getUserTablePreference("allProjectsTable", PreferenceKey.PerPage, 50)
  });

  const orgAdminAccessProject = useOrgAdminAccessProject();

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference("allProjectsTable", PreferenceKey.PerPage, newPerPage);
  };

  const { popUp, handlePopUpToggle, handlePopUpOpen } = usePopUp([
    "requestAccessConfirmation"
  ] as const);

  const { data: searchedProjects, isPending: isProjectLoading } = useSearchProjects({
    limit,
    offset,
    name: debouncedSearch || undefined,
    orderDirection,
    type: projectType
  });

  const handleAccessProject = async (
    type: ProjectType,
    projectId: string,
    environments: ProjectEnv[],
    projectOrgId: string
  ) => {
    await orgAdminAccessProject.mutateAsync({ projectId });
    await navigate({
      to: getProjectHomePage(type, environments),
      params: { orgId: projectOrgId, projectId }
    });
  };

  useResetPageHelper({
    setPage,
    offset,
    totalCount: searchedProjects?.totalCount || 0
  });

  const requestedWorkspaceDetails = (popUp.requestAccessConfirmation.data || {}) as Project;

  return (
    <div>
      <Toolbar
        searchFilter={searchFilter}
        onSearchChange={setSearchFilter}
        orderDirection={orderDirection}
        onToggleOrderDirection={toggleOrderDirection}
        projectsViewMode={ProjectsViewMode.LIST}
        onViewModeChange={() => {}}
        projectListView={projectListView}
        onProjectListViewChange={onProjectListViewChange}
        onAddNewProject={onAddNewProject}
        onUpgradePlan={onUpgradePlan}
        isAddingProjectsAllowed={isAddingProjectsAllowed}
        isGridDisabled
      />
      <div className="mt-4 w-full rounded-md">
        {isProjectLoading &&
          Array.apply(0, Array(3)).map((_x, i) => (
            <div
              key={`workspace-cards-loading-${i + 1}`}
              className={twMerge(
                "flex h-12 min-w-72 cursor-pointer flex-row items-center justify-between border border-mineshaft-600 bg-mineshaft-800 px-6 hover:bg-mineshaft-700",
                i === 0 && "rounded-t-md",
                i === 2 && "rounded-b-md border-b"
              )}
            >
              <Skeleton className="w-full bg-mineshaft-600" />
            </div>
          ))}
        {!isProjectLoading &&
          searchedProjects?.projects?.map((workspace) => (
            <div
              role="button"
              tabIndex={0}
              onKeyDown={(evt) => {
                if (evt.key === "Enter" && workspace.isMember) {
                  navigate({
                    to: getProjectHomePage(workspace.type, workspace.environments),
                    params: { orgId: currentOrg?.id || "", projectId: workspace.id }
                  });
                }
              }}
              onClick={() => {
                if (workspace.isMember) {
                  navigate({
                    to: getProjectHomePage(workspace.type, workspace.environments),
                    params: { orgId: currentOrg?.id || "", projectId: workspace.id }
                  });
                }
              }}
              key={workspace.id}
              className={twMerge(
                "group flex min-w-72 items-center justify-center border-t border-r border-l border-mineshaft-600 bg-mineshaft-800 px-6 py-3 first:rounded-t-md",
                workspace.isMember ? "cursor-pointer hover:bg-mineshaft-700" : "cursor-default"
              )}
            >
              <div className="mr-3 flex min-w-0 flex-1 items-center gap-3">
                <div className="rounded-sm border border-mineshaft-500 bg-mineshaft-600 p-1 shadow-inner">
                  <Lottie
                    className="h-[1.35rem] w-[1.35rem] shrink-0"
                    icon={getProjectLottieIcon(workspace.type)}
                  />
                </div>
                <div className="-mt-0.5 flex min-w-0 flex-col">
                  <p className="truncate text-sm text-mineshaft-100">{workspace.name}</p>
                  <p className="truncate text-xs leading-4 text-mineshaft-300">
                    {getProjectTitle(workspace.type)}{" "}
                    {workspace.description ? `- ${workspace.description}` : ""}
                  </p>
                </div>
              </div>
              {workspace.isMember ? (
                <Badge variant="info">
                  <CheckIcon />
                  Joined
                </Badge>
              ) : (
                <OrgPermissionCan
                  I={OrgPermissionAdminConsoleAction.AccessAllProjects}
                  an={OrgPermissionSubjects.AdminConsole}
                >
                  {(isAllowed) =>
                    isAllowed ? (
                      <Button
                        size="xs"
                        variant="outline_bg"
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          handleAccessProject(
                            workspace.type,
                            workspace.id,
                            workspace.environments,
                            workspace.orgId
                          );
                        }}
                        disabled={
                          orgAdminAccessProject.variables?.projectId === workspace.id &&
                          orgAdminAccessProject.isPending
                        }
                      >
                        Join as Admin
                      </Button>
                    ) : (
                      <Button
                        size="xs"
                        variant="outline_bg"
                        onClick={() => handlePopUpOpen("requestAccessConfirmation", workspace)}
                      >
                        Request Access
                      </Button>
                    )
                  }
                </OrgPermissionCan>
              )}
            </div>
          ))}
      </div>
      {!isProjectLoading && Boolean(searchedProjects?.totalCount) && (
        <Pagination
          className="rounded-b-md border border-mineshaft-600"
          perPage={perPage}
          perPageList={[12, 24, 48, 96]}
          count={searchedProjects?.totalCount || 0}
          page={page}
          onChangePage={setPage}
          onChangePerPage={handlePerPageChange}
        />
      )}
      {!isProjectLoading && !searchedProjects?.totalCount && (
        <EmptyState
          projectType={projectType}
          onAddNewProject={onAddNewProject}
          onUpgradePlan={onUpgradePlan}
          isAddingProjectsAllowed={isAddingProjectsAllowed}
        />
      )}
      <RequestProjectAccessModal
        isOpen={popUp.requestAccessConfirmation.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("requestAccessConfirmation", isOpen)}
        project={requestedWorkspaceDetails}
      />
    </div>
  );
};

const Toolbar = ({
  searchFilter,
  onSearchChange,
  orderDirection,
  onToggleOrderDirection,
  projectsViewMode,
  onViewModeChange,
  projectListView,
  onProjectListViewChange,
  onAddNewProject,
  onUpgradePlan,
  isAddingProjectsAllowed,
  isGridDisabled
}: {
  searchFilter: string;
  onSearchChange: (value: string) => void;
  orderDirection: OrderByDirection;
  onToggleOrderDirection: () => void;
  projectsViewMode: ProjectsViewMode;
  onViewModeChange: (mode: ProjectsViewMode) => void;
  projectListView: ProjectListView;
  onProjectListViewChange: (value: ProjectListView) => void;
  onAddNewProject: () => void;
  onUpgradePlan: () => void;
  isAddingProjectsAllowed: boolean;
  isGridDisabled?: boolean;
}) => (
  <div className="flex w-full flex-row flex-wrap gap-2 md:flex-nowrap md:gap-0">
    <ProjectListToggle value={projectListView} onChange={onProjectListViewChange} />
    <Input
      className="h-[2.3rem] bg-mineshaft-800 text-sm placeholder-mineshaft-50/60 duration-200 focus:bg-mineshaft-700/80"
      containerClassName="w-full ml-2"
      placeholder="Search by project name..."
      value={searchFilter}
      onChange={(e) => onSearchChange(e.target.value)}
      leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
    />
    <div className="ml-2 flex rounded-md border border-mineshaft-600 bg-mineshaft-800 p-1">
      <Tooltip content="Toggle Sort Direction">
        <IconButton
          className="min-w-[2.4rem] border-none hover:bg-mineshaft-600"
          ariaLabel={`Sort ${orderDirection === OrderByDirection.ASC ? "descending" : "ascending"}`}
          variant="plain"
          size="xs"
          colorSchema="secondary"
          onClick={onToggleOrderDirection}
        >
          <FontAwesomeIcon
            icon={orderDirection === OrderByDirection.ASC ? faArrowDownAZ : faArrowUpZA}
          />
        </IconButton>
      </Tooltip>
    </div>
    <div className="ml-2 flex gap-x-0.5 rounded-md border border-mineshaft-600 bg-mineshaft-800 p-1">
      {isGridDisabled ? (
        <Tooltip content="Disabled across All Project view.">
          <div className="flex cursor-not-allowed items-center justify-center">
            <IconButton
              variant="outline_bg"
              ariaLabel="grid"
              size="xs"
              isDisabled
              className="pointer-events-none min-w-[2.4rem] border-none bg-transparent hover:bg-mineshaft-600"
            >
              <FontAwesomeIcon icon={faBorderAll} />
            </IconButton>
          </div>
        </Tooltip>
      ) : (
        <IconButton
          variant="outline_bg"
          onClick={() => onViewModeChange(ProjectsViewMode.GRID)}
          ariaLabel="grid"
          size="xs"
          className={`${
            projectsViewMode === ProjectsViewMode.GRID ? "bg-mineshaft-500" : "bg-transparent"
          } min-w-[2.4rem] border-none hover:bg-mineshaft-600`}
        >
          <FontAwesomeIcon icon={faBorderAll} />
        </IconButton>
      )}
      <IconButton
        variant="outline_bg"
        onClick={() => onViewModeChange(ProjectsViewMode.LIST)}
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
      {(isOldProjectV1Allowed) => (
        <OrgPermissionCan I={OrgPermissionActions.Create} an={OrgPermissionSubjects.Project}>
          {(isAllowed) => (
            <Button
              isDisabled={!isAllowed && !isOldProjectV1Allowed}
              colorSchema="secondary"
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
              onClick={() => {
                if (isAddingProjectsAllowed) {
                  onAddNewProject();
                } else {
                  onUpgradePlan();
                }
              }}
              className="ml-2"
            >
              Add New Project
            </Button>
          )}
        </OrgPermissionCan>
      )}
    </OrgPermissionCan>
  </div>
);

const EmptyState = ({
  projectType,
  onAddNewProject,
  onUpgradePlan,
  isAddingProjectsAllowed
}: {
  projectType: ProjectType;
  onAddNewProject: () => void;
  onUpgradePlan: () => void;
  isAddingProjectsAllowed: boolean;
}) => {
  const typeTitle = getProjectTitle(projectType);

  return (
    <div className="mt-4 w-full rounded-md border border-mineshaft-700 bg-mineshaft-800 px-4 py-10 text-base text-mineshaft-300">
      <div className="flex justify-center">
        <Lottie icon={getProjectLottieIcon(projectType)} className="mb-4 h-16 w-16" />
      </div>
      <div className="text-center text-lg font-light">No {typeTitle} projects yet</div>
      <div className="mt-1 text-center text-sm font-light text-mineshaft-400">
        Create your first {typeTitle} project to get started.
      </div>
      <div className="mt-4 flex justify-center">
        <OrgPermissionCan I={OrgPermissionActions.Create} an={OrgPermissionSubjects.Project}>
          {(isAllowed) => (
            <Button
              isDisabled={!isAllowed}
              colorSchema="primary"
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
              onClick={() => {
                if (isAddingProjectsAllowed) {
                  onAddNewProject();
                } else {
                  onUpgradePlan();
                }
              }}
            >
              Create Project
            </Button>
          )}
        </OrgPermissionCan>
      </div>
    </div>
  );
};
