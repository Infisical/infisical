import { ReactNode, useMemo, useState } from "react";
import { faFolderOpen, faStar } from "@fortawesome/free-regular-svg-icons";
import {
  faArrowDownAZ,
  faArrowRight,
  faArrowUpZA,
  faBorderAll,
  faList,
  faMagnifyingGlass,
  faPlus,
  faSearch,
  faStar as faSolidStar
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { Button, IconButton, Input, Pagination, Skeleton, Tooltip } from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import { getProjectHomePage } from "@app/helpers/project";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { usePagination, useResetPageHelper } from "@app/hooks";
import { useGetUserWorkspaces } from "@app/hooks/api";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { useUpdateUserProjectFavorites } from "@app/hooks/api/users/mutation";
import { useGetUserProjectFavorites } from "@app/hooks/api/users/queries";
import { Workspace } from "@app/hooks/api/workspace/types";

type Props = {
  onAddNewProject: () => void;
  onUpgradePlan: () => void;
  isAddingProjectsAllowed: boolean;
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
  isAddingProjectsAllowed
}: Props) => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();

  const { data: workspaces = [], isPending: isWorkspaceLoading } = useGetUserWorkspaces();
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
          to: getProjectHomePage(workspace.defaultProduct),
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
          to: getProjectHomePage(workspace.defaultProduct),
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
  } else if (workspaces.length && searchFilter) {
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
    <div>
      <div className="flex w-full flex-row">
        <div className="flex-grow" />
        <Input
          className="h-[2.3rem] bg-mineshaft-800 text-sm placeholder-mineshaft-50 duration-200 focus:bg-mineshaft-700/80"
          containerClassName="w-full"
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
          onChangePerPage={handlePerPageChange}
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
  );
};
