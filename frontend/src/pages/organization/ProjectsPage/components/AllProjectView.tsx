import { useState } from "react";
import {
  faArrowDownAZ,
  faBorderAll,
  faCheckCircle,
  faFolderOpen,
  faList,
  faMagnifyingGlass,
  faPlus
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";
import { CheckIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { OrgPermissionCan } from "@app/components/permissions";
import { RequestProjectAccessModal } from "@app/components/projects/RequestProjectAccessModal";
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
import { Badge } from "@app/components/v3";
import { OrgPermissionActions, OrgPermissionSubjects, useOrganization } from "@app/context";
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

export const AllProjectView = ({
  onAddNewProject,
  onUpgradePlan,
  isAddingProjectsAllowed,
  projectListView,
  onProjectListViewChange
}: Props) => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const [searchFilter, setSearchFilter] = useState("");
  const [debouncedSearch] = useDebounce(searchFilter);
  const [projectTypeFilter, setProjectTypeFilter] = useState<ProjectType>();
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
    type: projectTypeFilter
  });

  const handleAccessProject = async (
    type: ProjectType,
    projectId: string,
    environments: ProjectEnv[],
    orgId: string
  ) => {
    await orgAdminAccessProject.mutateAsync({
      projectId
    });
    await navigate({
      to: getProjectHomePage(type, environments),
      params: {
        orgId,
        projectId
      }
    });
  };

  useResetPageHelper({
    setPage,
    offset,
    totalCount: searchedProjects?.totalCount || 0
  });
  const requestedWorkspaceDetails = (popUp.requestAccessConfirmation.data || {}) as Project;

  const handleToggleFilterByProjectType = (el: ProjectType) =>
    setProjectTypeFilter((state) => (state === el ? undefined : el));

  return (
    <div>
      <div className="flex w-full flex-row flex-wrap gap-2 md:flex-nowrap md:gap-0">
        <ProjectListToggle value={projectListView} onChange={onProjectListViewChange} />
        <Input
          className="h-[2.3rem] bg-mineshaft-800 text-sm placeholder-mineshaft-50 duration-200 focus:bg-mineshaft-700/80"
          containerClassName="w-full ml-2"
          placeholder="Search by project name..."
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
        />
        <div className="ml-2 flex rounded-md border border-mineshaft-600 bg-mineshaft-800 p-1">
          <Tooltip content="Toggle Sort Direction">
            <IconButton
              className="min-w-[2.4rem] border-none hover:bg-mineshaft-600"
              ariaLabel="Sort asc"
              variant="plain"
              size="xs"
              colorSchema="secondary"
              onClick={toggleOrderDirection}
            >
              <FontAwesomeIcon icon={faArrowDownAZ} />
            </IconButton>
          </Tooltip>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <div
              className={twMerge(
                "ml-2 flex rounded-md border border-mineshaft-600 bg-mineshaft-800 p-1",
                projectTypeFilter && "border-primary-400 text-primary-400"
              )}
            >
              <Tooltip content="Choose visible project type" className="mb-2">
                <IconButton
                  ariaLabel="project-types"
                  className={twMerge(
                    "min-w-[2.4rem] border-none hover:bg-mineshaft-600",
                    projectTypeFilter && "text-primary-400"
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
                icon={projectTypeFilter === el && <FontAwesomeIcon icon={faCheckCircle} />}
                iconPos="right"
              >
                <div className="flex items-center gap-2">
                  <span>{getProjectTitle(el)}</span>
                </div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="ml-2 flex gap-x-0.5 rounded-md border border-mineshaft-600 bg-mineshaft-800 p-1">
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
          <IconButton
            variant="outline_bg"
            ariaLabel="list"
            size="xs"
            className="min-w-[2.4rem] border-none bg-mineshaft-500 hover:bg-mineshaft-600"
          >
            <FontAwesomeIcon icon={faList} />
          </IconButton>
        </div>
        <OrgPermissionCan I={OrgPermissionActions.Create} an={OrgPermissionSubjects.Workspace}>
          {(isOldProjectPermissionAllowed) => (
            <OrgPermissionCan I={OrgPermissionActions.Create} an={OrgPermissionSubjects.Project}>
              {(isAllowed) => (
                <Button
                  isDisabled={!isAllowed && !isOldProjectPermissionAllowed}
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
                      orgId: currentOrg?.id || "",
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
                      orgId: currentOrg?.id || "",
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
