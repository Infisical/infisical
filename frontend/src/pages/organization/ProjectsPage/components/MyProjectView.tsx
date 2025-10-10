import { ReactNode, useMemo, useState } from "react";
import { faFolderOpen, faStar } from "@fortawesome/free-regular-svg-icons";
import {
  faArrowDownAZ,
  faArrowUpZA,
  faBorderAll,
  faCheckCircle,
  faList,
  faMagnifyingGlass,
  faPlus,
  faSearch,
  faStar as faSolidStar
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  IconButton,
  Input,
  Lottie,
  Pagination,
  Skeleton,
  Tooltip
} from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import { getProjectHomePage, getProjectLottieIcon, getProjectTitle } from "@app/helpers/project";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { usePagination, useResetPageHelper } from "@app/hooks";
import { useGetUserProjects } from "@app/hooks/api";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { Project, ProjectType } from "@app/hooks/api/projects/types";
import { useUpdateUserProjectFavorites } from "@app/hooks/api/users/mutation";
import { useGetUserProjectFavorites } from "@app/hooks/api/users/queries";
import {
  ProjectListToggle,
  ProjectListView
} from "@app/pages/organization/ProjectsPage/components/ProjectListToggle";

type Props = {
  onAddNewProject: () => void;
  onUpgradePlan: () => void;
  isAddingProjectsAllowed: boolean;
  projectListView: ProjectListView;
  onProjectListViewChange: (value: ProjectListView) => void;
};

enum ProjectOrderBy {
  Name = "name"
}

enum ProjectsViewMode {
  GRID = "grid",
  LIST = "list"
}

export const MyProjectView = ({
  onAddNewProject,
  onUpgradePlan,
  isAddingProjectsAllowed,
  projectListView,
  onProjectListViewChange
}: Props) => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const [projectTypeFilter, setProjectTypeFilter] = useState<Partial<Record<ProjectType, boolean>>>(
    {}
  );

  const { data: workspaces = [], isPending: isWorkspaceLoading } = useGetUserProjects();
  const {
    setPage,
    perPage,
    setPerPage,
    page,
    offset,
    limit,
    toggleOrderDirection,
    orderDirection
  } = usePagination(ProjectOrderBy.Name, {
    initPerPage: getUserTablePreference("myProjectsTable", PreferenceKey.PerPage, 24)
  });
  const isTableFilteredByType = Boolean(Object.values(projectTypeFilter).some((el) => el));

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference("myProjectsTable", PreferenceKey.PerPage, newPerPage);
  };

  const { data: projectFavorites, isPending: isProjectFavoritesLoading } =
    useGetUserProjectFavorites(currentOrg?.id);

  const [projectsViewMode, setProjectsViewMode] = useState<ProjectsViewMode>(
    (localStorage.getItem("projectsViewMode") as ProjectsViewMode) || ProjectsViewMode.GRID
  );
  const [searchFilter, setSearchFilter] = useState("");

  const isProjectViewLoading = isWorkspaceLoading || isProjectFavoritesLoading;
  const isWorkspaceEmpty = !isProjectViewLoading && workspaces?.length === 0;
  const { mutateAsync: updateUserProjectFavorites } = useUpdateUserProjectFavorites();

  const filteredWorkspaces = useMemo(
    () =>
      workspaces
        .filter((ws) => {
          if (isTableFilteredByType && !projectTypeFilter?.[ws.type]) {
            return false;
          }
          return ws?.name?.toLowerCase().includes(searchFilter.toLowerCase());
        })
        .sort((a, b) =>
          orderDirection === OrderByDirection.ASC
            ? a.name.toLowerCase().localeCompare(b.name.toLowerCase())
            : b.name.toLowerCase().localeCompare(a.name.toLowerCase())
        ),
    [searchFilter, orderDirection, workspaces, projectTypeFilter]
  );

  useResetPageHelper({
    setPage,
    offset,
    totalCount: filteredWorkspaces.length
  });

  const { workspacesWithFaveProp } = useMemo(() => {
    const workspacesWithFav = filteredWorkspaces
      .map((w): Project & { isFavorite: boolean } => ({
        ...w,
        isFavorite: Boolean(projectFavorites?.includes(w.id))
      }))
      .sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite))
      .slice(offset, limit * page);

    return {
      workspacesWithFaveProp: workspacesWithFav
    };
  }, [filteredWorkspaces, projectFavorites, offset, limit, page]);

  const handleToggleFilterByProjectType = (type: ProjectType) => {
    setProjectTypeFilter((state) => {
      return {
        ...(state || {}),
        [type]: !state?.[type]
      };
    });
  };

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

  const renderProjectGridItem = (workspace: Project, isFavorite: boolean) => (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
    <div
      onClick={() => {
        navigate({
          to: getProjectHomePage(workspace.type, workspace.environments),
          params: {
            projectId: workspace.id
          }
        });
      }}
      key={workspace.id}
      className="border-mineshaft-600 border-l-mineshaft-400 bg-mineshaft-800 hover:border-l-primary hover:bg-mineshaft-700 cursor-pointer overflow-clip rounded-sm border border-l-4 p-4 transition-transform duration-100 hover:scale-[103%]"
    >
      <div className="flex items-center gap-4">
        <div className="border-mineshaft-500 bg-mineshaft-600 rounded-sm border p-1.5 shadow-inner">
          <Lottie className="h-7 w-7 shrink-0" icon={getProjectLottieIcon(workspace.type)} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-mineshaft-100 truncate text-lg font-medium">{workspace.name}</p>
          <p className="text-mineshaft-300 truncate text-sm leading-4">
            {getProjectTitle(workspace.type)}
          </p>
        </div>
        <div className="mt-0.5 self-start">
          {isFavorite ? (
            <FontAwesomeIcon
              icon={faSolidStar}
              className="hover:text-mineshaft-400 text-sm text-yellow-600"
              onClick={(e) => {
                e.stopPropagation();
                removeProjectFromFavorites(workspace.id);
              }}
            />
          ) : (
            <FontAwesomeIcon
              icon={faStar}
              className="text-mineshaft-400 hover:text-mineshaft-300 text-sm"
              onClick={(e) => {
                e.stopPropagation();
                addProjectToFavorites(workspace.id);
              }}
            />
          )}
        </div>
      </div>
      <p className="text-mineshaft-400 mt-4 truncate text-sm">
        {workspace.description || "No description"}
      </p>
    </div>
  );
  const renderProjectListItem = (workspace: Project, isFavorite: boolean, index: number) => (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
    <div
      onClick={() => {
        navigate({
          to: getProjectHomePage(workspace.type, workspace.environments),
          params: {
            projectId: workspace.id
          }
        });
      }}
      key={workspace.id}
      className={`border-mineshaft-600 bg-mineshaft-800 hover:bg-mineshaft-700 group flex min-w-72 cursor-pointer border-l border-r border-t px-6 py-3 ${
        index === 0 && "rounded-t-md"
      }`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="border-mineshaft-500 bg-mineshaft-600 rounded-sm border p-1 shadow-inner">
          <Lottie
            className="h-[1.35rem] w-[1.35rem] shrink-0"
            icon={getProjectLottieIcon(workspace.type)}
          />
        </div>
        <div className="-mt-0.5 flex min-w-0 flex-col">
          <p className="text-mineshaft-100 truncate text-sm">{workspace.name}</p>
          <p className="text-mineshaft-300 truncate text-xs leading-4">
            {getProjectTitle(workspace.type)}{" "}
            {workspace.description ? `- ${workspace.description}` : ""}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-end">
        {isFavorite ? (
          <FontAwesomeIcon
            icon={faSolidStar}
            className="hover:text-mineshaft-400 ml-6 text-sm text-yellow-600"
            onClick={(e) => {
              e.stopPropagation();
              removeProjectFromFavorites(workspace.id);
            }}
          />
        ) : (
          <FontAwesomeIcon
            icon={faStar}
            className="text-mineshaft-400 hover:text-mineshaft-300 ml-6 text-sm"
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
                  className="border-mineshaft-600 bg-mineshaft-800 flex h-40 min-w-72 flex-col justify-between rounded-md border p-4"
                >
                  <div className="text-mineshaft-100 mt-0 text-lg">
                    <Skeleton className="bg-mineshaft-600 w-3/4" />
                  </div>
                  <div className="text-mineshaft-300 mt-0 pb-6 text-sm">
                    <Skeleton className="bg-mineshaft-600 w-1/2" />
                  </div>
                  <div className="flex justify-end">
                    <Skeleton className="bg-mineshaft-600 w-1/2" />
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
                  className={`border-mineshaft-600 bg-mineshaft-800 hover:bg-mineshaft-700 group flex h-12 min-w-72 cursor-pointer flex-row items-center justify-between border px-6 ${
                    i === 0 && "rounded-t-md"
                  } ${i === 2 && "rounded-b-md border-b"}`}
                >
                  <Skeleton className="bg-mineshaft-600 w-full" />
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
  } else if (workspaces.length && searchFilter) {
    projectsComponents = (
      <div className="border-mineshaft-700 bg-mineshaft-800 text-mineshaft-300 mt-4 w-full rounded-md border px-4 py-6 text-base">
        <FontAwesomeIcon
          icon={faSearch}
          className="text-mineshaft-400 mb-4 mt-2 w-full text-center text-5xl"
        />
        <div className="text-center font-light">No projects match search...</div>
      </div>
    );
  } else if (filteredWorkspaces.length === 0 && isTableFilteredByType) {
    projectsComponents = (
      <div className="border-mineshaft-700 bg-mineshaft-800 text-mineshaft-300 mt-4 w-full rounded-md border px-4 py-6 text-base">
        <FontAwesomeIcon
          icon={faSearch}
          className="text-mineshaft-400 mb-4 mt-2 w-full text-center text-5xl"
        />
        <div className="text-center font-light">No projects match filters...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex w-full flex-row">
        <ProjectListToggle value={projectListView} onChange={onProjectListViewChange} />
        <Input
          className="bg-mineshaft-800 placeholder-mineshaft-50 focus:bg-mineshaft-700/80 h-[2.3rem] text-sm duration-200"
          containerClassName="w-full ml-2"
          placeholder="Search by project name..."
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
        />
        <div className="border-mineshaft-600 bg-mineshaft-800 ml-2 flex rounded-md border p-1">
          <Tooltip content="Toggle Sort Direction">
            <IconButton
              className="hover:bg-mineshaft-600 min-w-[2.4rem] border-none"
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <div
              className={twMerge(
                "border-mineshaft-600 bg-mineshaft-800 ml-2 flex rounded-md border p-1",
                isTableFilteredByType && "border-primary-400 text-primary-400"
              )}
            >
              <Tooltip content="Choose visible project type" className="mb-2">
                <IconButton
                  ariaLabel="project-types"
                  className={twMerge(
                    "hover:bg-mineshaft-600 min-w-[2.4rem] border-none",
                    isTableFilteredByType && "text-primary-400"
                  )}
                  variant="plain"
                  size="xs"
                  colorSchema="secondary"
                >
                  <FontAwesomeIcon icon={faList} />
                </IconButton>
              </Tooltip>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="thin-scrollbar overflow-y-auto" align="end">
            <DropdownMenuLabel>Filter By Project Type</DropdownMenuLabel>
            {Object.values(ProjectType).map((el) => (
              <DropdownMenuItem
                key={`filter-item-${el}`}
                onClick={(e) => {
                  e.preventDefault();
                  handleToggleFilterByProjectType(el);
                }}
                icon={projectTypeFilter?.[el] && <FontAwesomeIcon icon={faCheckCircle} />}
                iconPos="right"
              >
                <div className="flex items-center gap-2">
                  <span>{getProjectTitle(el)}</span>
                </div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="border-mineshaft-600 bg-mineshaft-800 ml-2 flex gap-x-0.5 rounded-md border p-1">
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
            } hover:bg-mineshaft-600 min-w-[2.4rem] border-none`}
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
            } hover:bg-mineshaft-600 min-w-[2.4rem] border-none`}
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
      {projectsComponents}
      {!isProjectViewLoading && Boolean(filteredWorkspaces.length) && (
        <Pagination
          className={
            projectsViewMode === ProjectsViewMode.GRID
              ? "justify-start! col-span-full border-transparent bg-transparent pl-2"
              : "border-mineshaft-600 rounded-b-md border"
          }
          perPage={perPage}
          perPageList={[12, 24, 48, 96]}
          count={filteredWorkspaces.length}
          page={page}
          onChangePage={setPage}
          onChangePerPage={handlePerPageChange}
        />
      )}
      {isWorkspaceEmpty && !isTableFilteredByType && (
        <div className="border-mineshaft-700 bg-mineshaft-800 text-mineshaft-300 mt-4 w-full rounded-md border px-4 py-6 text-base">
          <FontAwesomeIcon
            icon={faFolderOpen}
            className="text-mineshaft-400 mb-4 mt-2 w-full text-center text-5xl"
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
  );
};
