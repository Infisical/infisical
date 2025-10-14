import { faCheck, faFolderOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { RequestProjectAccessModal } from "@app/components/projects/RequestProjectAccessModal";
import { Badge, Button, Lottie, Pagination, Skeleton } from "@app/components/v2";
import { OrgPermissionSubjects } from "@app/context";
import { OrgPermissionAdminConsoleAction } from "@app/context/OrgPermissionContext/types";
import { getProjectHomePage, getProjectLottieIcon, getProjectTitle } from "@app/helpers/project";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { useDebounce, usePagination, usePopUp, useResetPageHelper } from "@app/hooks";
import { useOrgAdminAccessProject, useSearchProjects } from "@app/hooks/api";
import { Project, ProjectEnv, ProjectType } from "@app/hooks/api/projects/types";
import { OrderByDirection } from "@app/hooks/api/generic/types";

type Props = {
  searchValue: string;
  orderDirection: OrderByDirection;
};

export const AllProjectView = ({ searchValue = "", orderDirection }: Props) => {
  const navigate = useNavigate();
  const [debouncedSearch] = useDebounce(searchValue);
  const { setPage, perPage, setPerPage, page, offset, limit } = usePagination("name", {
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
    orderDirection
  });

  const handleAccessProject = async (
    type: ProjectType,
    projectId: string,
    environments: ProjectEnv[]
  ) => {
    try {
      await orgAdminAccessProject.mutateAsync({
        projectId
      });
      await navigate({
        to: getProjectHomePage(type, environments),
        params: {
          projectId
        }
      });
    } catch {
      createNotification({
        text: "Failed to access project",
        type: "error"
      });
    }
  };

  useResetPageHelper({
    setPage,
    offset,
    totalCount: searchedProjects?.totalCount || 0
  });
  const requestedWorkspaceDetails = (popUp.requestAccessConfirmation.data || {}) as Project;

  return (
    <div>
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
                    params: {
                      projectId: workspace.id
                    }
                  });
                }
              }}
              onClick={() => {
                if (workspace.isMember) {
                  navigate({
                    to: getProjectHomePage(workspace.type, workspace.environments),
                    params: {
                      projectId: workspace.id
                    }
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
                <Badge className="flex items-center" variant="success">
                  <FontAwesomeIcon icon={faCheck} className="mr-1" />
                  <span>Joined</span>
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
                          handleAccessProject(workspace.type, workspace.id, workspace.environments);
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
        <div className="mt-4 w-full rounded-md border border-mineshaft-700 bg-mineshaft-800 px-4 py-6 text-base text-mineshaft-300">
          <FontAwesomeIcon
            icon={faFolderOpen}
            className="mt-2 mb-4 w-full text-center text-5xl text-mineshaft-400"
          />
          <div className="text-center font-light">No Projects Found</div>
        </div>
      )}
      <RequestProjectAccessModal
        isOpen={popUp.requestAccessConfirmation.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("requestAccessConfirmation", isOpen)}
        project={requestedWorkspaceDetails}
      />
    </div>
  );
};
