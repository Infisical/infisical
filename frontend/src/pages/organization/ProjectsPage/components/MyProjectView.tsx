import { ReactNode, useMemo } from "react";
import { faFolderOpen, faStar } from "@fortawesome/free-regular-svg-icons";
import { faSearch, faStar as faSolidStar } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import { Lottie, Pagination, Skeleton } from "@app/components/v2";
import { useOrganization } from "@app/context";
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

import { ProjectOrderBy, ResourceViewMode } from "./ResourceListToolbar";

type Props = {
  searchValue: string;
  orderDirection: OrderByDirection;
  resourceViewMode: ResourceViewMode;
  projectTypeFilter: Partial<Record<ProjectType, boolean>>;
  namespaceId?: string;
};

export const MyProjectView = ({
  resourceViewMode,
  searchValue = "",
  orderDirection,
  projectTypeFilter = {},
  namespaceId
}: Props) => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();

  const { data: projects = [], isPending: isProjectsLoading } = useGetUserProjects({
    namespaceId
  });
  const { setPage, perPage, setPerPage, page, offset, limit } = usePagination(ProjectOrderBy.Name, {
    initPerPage: getUserTablePreference("myProjectsTable", PreferenceKey.PerPage, 24)
  });
  const isTableFilteredByType = Boolean(Object.values(projectTypeFilter).some((el) => el));

  const { data: projectFavorites, isPending: isProjectFavoritesLoading } =
    useGetUserProjectFavorites(currentOrg?.id);

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference("myProjectsTable", PreferenceKey.PerPage, newPerPage);
  };

  const isProjectViewLoading = isProjectsLoading || isProjectFavoritesLoading;
  const isWorkspaceEmpty = !isProjectViewLoading && projects?.length === 0;
  const { mutateAsync: updateUserProjectFavorites } = useUpdateUserProjectFavorites();

  const filteredWorkspaces = useMemo(
    () =>
      projects
        .filter((ws) => {
          if (isTableFilteredByType && !projectTypeFilter?.[ws.type]) {
            return false;
          }
          return ws?.name?.toLowerCase().includes(searchValue.toLowerCase());
        })
        .sort((a, b) =>
          orderDirection === OrderByDirection.ASC
            ? a.name.toLowerCase().localeCompare(b.name.toLowerCase())
            : b.name.toLowerCase().localeCompare(a.name.toLowerCase())
        ),
    [searchValue, orderDirection, projects, projectTypeFilter]
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
      </div>
      <p className="mt-4 truncate text-sm text-mineshaft-400">
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
    switch (resourceViewMode) {
      case ResourceViewMode.GRID:
        projectsComponents = (
          <div className="mt-4 grid w-full grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3">
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
      case ResourceViewMode.LIST:
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
  } else if (projects.length && searchValue) {
    projectsComponents = (
      <div className="mt-4 w-full rounded-md border border-mineshaft-700 bg-mineshaft-800 px-4 py-6 text-base text-mineshaft-300">
        <FontAwesomeIcon
          icon={faSearch}
          className="mt-2 mb-4 w-full text-center text-5xl text-mineshaft-400"
        />
        <div className="text-center font-light">No projects match search...</div>
      </div>
    );
  } else if (filteredWorkspaces.length === 0 && isTableFilteredByType) {
    projectsComponents = (
      <div className="mt-4 w-full rounded-md border border-mineshaft-700 bg-mineshaft-800 px-4 py-6 text-base text-mineshaft-300">
        <FontAwesomeIcon
          icon={faSearch}
          className="mt-2 mb-4 w-full text-center text-5xl text-mineshaft-400"
        />
        <div className="text-center font-light">No projects match filters...</div>
      </div>
    );
  }

  return (
    <div>
      {projectsComponents}
      {!isProjectViewLoading && Boolean(filteredWorkspaces.length) && (
        <Pagination
          className={
            resourceViewMode === ResourceViewMode.GRID
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
      {isWorkspaceEmpty && !isTableFilteredByType && (
        <div className="mt-4 w-full rounded-md border border-mineshaft-700 bg-mineshaft-800 px-4 py-6 text-base text-mineshaft-300">
          <FontAwesomeIcon
            icon={faFolderOpen}
            className="mt-2 mb-4 w-full text-center text-5xl text-mineshaft-400"
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
