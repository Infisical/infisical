import { useState } from "react";
import { useForm } from "react-hook-form";
import {
  faArrowDownAZ,
  faBorderAll,
  faCheck,
  faCheckCircle,
  faFolderOpen,
  faList,
  faMagnifyingGlass,
  faPlus
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  FormControl,
  IconButton,
  Input,
  Lottie,
  Modal,
  ModalContent,
  Pagination,
  Skeleton,
  Tooltip
} from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/context";
import { getProjectHomePage, getProjectLottieIcon, getProjectTitle } from "@app/helpers/project";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { useDebounce, usePagination, usePopUp, useResetPageHelper } from "@app/hooks";
import { useRequestProjectAccess, useSearchProjects } from "@app/hooks/api";
import { ProjectType, Workspace } from "@app/hooks/api/workspace/types";

type Props = {
  onAddNewProject: () => void;
  onUpgradePlan: () => void;
  isAddingProjectsAllowed: boolean;
};

type RequestAccessModalProps = {
  projectId: string;
  onPopUpToggle: () => void;
};

const RequestAccessModal = ({ projectId, onPopUpToggle }: RequestAccessModalProps) => {
  const form = useForm<{ note: string }>();

  const requestProjectAccess = useRequestProjectAccess();

  const onFormSubmit = ({ note }: { note: string }) => {
    if (requestProjectAccess.isPending) return;
    requestProjectAccess.mutate(
      {
        comment: note,
        projectId
      },
      {
        onSuccess: () => {
          createNotification({
            type: "success",
            title: "Project Access Request Sent",
            text: "Project admins will receive an email of your request"
          });
          onPopUpToggle();
        }
      }
    );
  };

  return (
    <form onSubmit={form.handleSubmit(onFormSubmit)}>
      <FormControl label="Note">
        <Input {...form.register("note")} />
      </FormControl>
      <div className="mt-4 flex items-center">
        <Button className="mr-4" size="sm" type="submit" isLoading={form.formState.isSubmitting}>
          Submit Request
        </Button>
        <Button colorSchema="secondary" variant="plain" onClick={() => onPopUpToggle()}>
          Cancel
        </Button>
      </div>
    </form>
  );
};

export const AllProjectView = ({
  onAddNewProject,
  onUpgradePlan,
  isAddingProjectsAllowed
}: Props) => {
  const navigate = useNavigate();
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

  useResetPageHelper({
    setPage,
    offset,
    totalCount: searchedProjects?.totalCount || 0
  });
  const requestedWorkspaceDetails = (popUp.requestAccessConfirmation.data || {}) as Workspace;

  const handleToggleFilterByProjectType = (el: ProjectType) =>
    setProjectTypeFilter((state) => (state === el ? undefined : el));

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
        <div className="ml-2 flex rounded-md border border-mineshaft-600 bg-mineshaft-800 p-1">
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
          {(isAllowed) => (
            <Button
              isDisabled={!isAllowed}
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
                    to: getProjectHomePage(workspace.type),
                    params: {
                      projectId: workspace.id
                    }
                  });
                }
              }}
              onClick={() => {
                if (workspace.isMember) {
                  navigate({
                    to: getProjectHomePage(workspace.type),
                    params: {
                      projectId: workspace.id
                    }
                  });
                }
              }}
              key={workspace.id}
              className={twMerge(
                "group flex min-w-72 items-center justify-center border-l border-r border-t border-mineshaft-600 bg-mineshaft-800 px-6 py-3 first:rounded-t-md",
                workspace.isMember ? "cursor-pointer hover:bg-mineshaft-700" : "cursor-default"
              )}
            >
              <div className="mr-3 flex min-w-0 flex-1 items-center gap-3">
                <div className="rounded border border-mineshaft-500 bg-mineshaft-600 p-1 shadow-inner">
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
                <div className="opacity-0 transition-all group-hover:opacity-100">
                  <Button
                    size="xs"
                    variant="outline_bg"
                    onClick={() => handlePopUpOpen("requestAccessConfirmation", workspace)}
                  >
                    Request Access
                  </Button>
                </div>
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
            className="mb-4 mt-2 w-full text-center text-5xl text-mineshaft-400"
          />
          <div className="text-center font-light">No Projects Found</div>
        </div>
      )}
      <Modal
        isOpen={popUp.requestAccessConfirmation.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("requestAccessConfirmation", isOpen)}
      >
        <ModalContent
          title="Confirm Access Request"
          subTitle={`Requesting access to project ${requestedWorkspaceDetails?.name}. You may include an optional note for project admins to review your request.`}
        >
          <RequestAccessModal
            onPopUpToggle={() => handlePopUpToggle("requestAccessConfirmation")}
            projectId={requestedWorkspaceDetails?.id}
          />
        </ModalContent>
      </Modal>
    </div>
  );
};
