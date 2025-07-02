import { useMemo, useState } from "react";
import { faStar } from "@fortawesome/free-regular-svg-icons";
import {
  faCheck,
  faCube,
  faMagnifyingGlass,
  faPlus,
  faSort,
  faStar as faSolidStar
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, linkOptions } from "@tanstack/react-router";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { NewProjectModal } from "@app/components/projects";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  Input,
  Tooltip
} from "@app/components/v2";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  useOrganization,
  useSubscription,
  useWorkspace
} from "@app/context";
import { getCurrentProductFromUrl, getProjectHomePage } from "@app/helpers/project";
import { usePopUp } from "@app/hooks";
import { useGetUserWorkspaces } from "@app/hooks/api";
import { useUpdateUserProjectFavorites } from "@app/hooks/api/users/mutation";
import { useGetUserProjectFavorites } from "@app/hooks/api/users/queries";
import { Workspace } from "@app/hooks/api/workspace/types";

// TODO(pta): add search to project select
export const ProjectSelect = () => {
  const [searchProject, setSearchProject] = useState("");
  const { currentWorkspace } = useWorkspace();
  const { currentOrg } = useOrganization();
  const { data: workspaces = [] } = useGetUserWorkspaces();
  const { data: projectFavorites } = useGetUserProjectFavorites(currentOrg.id);

  const { subscription } = useSubscription();

  const { mutateAsync: updateUserProjectFavorites } = useUpdateUserProjectFavorites();

  const addProjectToFavorites = async (projectId: string) => {
    try {
      await updateUserProjectFavorites({
        orgId: currentOrg!.id,
        projectFavorites: [...(projectFavorites || []), projectId]
      });
    } catch {
      createNotification({
        text: "Failed to add project to favorites.",
        type: "error"
      });
    }
  };

  const removeProjectFromFavorites = async (projectId: string) => {
    try {
      await updateUserProjectFavorites({
        orgId: currentOrg!.id,
        projectFavorites: [...(projectFavorites || []).filter((entry) => entry !== projectId)]
      });
    } catch {
      createNotification({
        text: "Failed to remove project from favorites.",
        type: "error"
      });
    }
  };

  const isAddingProjectsAllowed = subscription?.workspaceLimit
    ? subscription.workspacesUsed < subscription.workspaceLimit
    : true;

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "addNewWs",
    "upgradePlan"
  ] as const);

  const projects = useMemo(() => {
    const projectOptions = workspaces
      .map((w): Workspace & { isFavorite: boolean } => ({
        ...w,
        isFavorite: Boolean(projectFavorites?.includes(w.id))
      }))
      .sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite));

    return projectOptions;
  }, [workspaces, projectFavorites, currentWorkspace]);

  return (
    <div className="flex w-full items-center gap-2">
      <DropdownMenu modal={false}>
        <Link
          to={getProjectHomePage(
            getCurrentProductFromUrl(window.location.href) || currentWorkspace.defaultProduct
          )}
          params={{
            projectId: currentWorkspace.id
          }}
        >
          <div className="flex cursor-pointer items-center gap-2 text-sm text-white duration-100 hover:text-primary-400">
            <div>
              <FontAwesomeIcon icon={faCube} className="text-xs" />
            </div>
            <Tooltip content={currentWorkspace.name} className="max-w-96">
              <div className="max-w-32 overflow-hidden text-ellipsis whitespace-nowrap">
                {currentWorkspace?.name}
              </div>
            </Tooltip>
          </div>
        </Link>
        <DropdownMenuTrigger asChild>
          <div>
            <IconButton
              variant="plain"
              colorSchema="secondary"
              ariaLabel="switch-org"
              className="px-2 py-1"
            >
              <FontAwesomeIcon icon={faSort} className="text-xs text-bunker-300" />
            </IconButton>
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          side="bottom"
          className="mt-6 cursor-default p-1 shadow-mineshaft-600 drop-shadow-md"
          style={{ minWidth: "220px" }}
        >
          <div className="px-2 py-1 text-xs capitalize text-mineshaft-400">Projects</div>
          <div className="mb-1 border-b border-b-mineshaft-600 py-1 pb-1">
            <Input
              value={searchProject}
              onChange={(evt) => setSearchProject(evt.target.value || "")}
              leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
              size="xs"
              variant="plain"
              placeholder="Search projects"
            />
          </div>
          <div className="thin-scrollbar max-h-80 overflow-auto">
            {projects
              ?.filter((el) => el.name?.toLowerCase().includes(searchProject.toLowerCase()))
              ?.map((workspace) => {
                return (
                  <DropdownMenuItem
                    key={workspace.id}
                    onClick={async () => {
                      // todo(akhi): this is not using react query because react query in overview is throwing error when envs are not exact same count
                      // to reproduce change this back to router.push and switch between two projects with different env count
                      // look into this on dashboard revamp
                      const url = linkOptions({
                        to: getProjectHomePage(workspace.defaultProduct),
                        params: {
                          projectId: workspace.id
                        }
                      });
                      window.location.assign(url.to.replaceAll("$projectId", workspace.id));
                    }}
                    icon={
                      currentWorkspace?.id === workspace.id && (
                        <FontAwesomeIcon icon={faCheck} className="mr-3 text-primary" />
                      )
                    }
                  >
                    <div className="flex items-center">
                      <div className="flex flex-1 items-center justify-between overflow-hidden">
                        <Tooltip side="right" className="break-words" content={workspace.name}>
                          <div className="max-w-40 overflow-hidden truncate whitespace-nowrap">
                            {workspace.name}
                          </div>
                        </Tooltip>
                      </div>
                      <div>
                        <FontAwesomeIcon
                          icon={workspace.isFavorite ? faSolidStar : faStar}
                          className="text-sm text-yellow-600 hover:text-mineshaft-400"
                          onClick={async (e) => {
                            e.stopPropagation();
                            await (
                              workspace.isFavorite
                                ? removeProjectFromFavorites
                                : addProjectToFavorites
                            )(workspace.id);
                          }}
                        />
                      </div>
                    </div>
                  </DropdownMenuItem>
                );
              })}
          </div>
          <div className="mt-1 h-1 border-t border-mineshaft-600" />
          <OrgPermissionCan I={OrgPermissionActions.Create} a={OrgPermissionSubjects.Workspace}>
            {(isAllowed) => (
              <DropdownMenuItem
                isDisabled={!isAllowed}
                icon={<FontAwesomeIcon icon={faPlus} />}
                onClick={() =>
                  handlePopUpOpen(isAddingProjectsAllowed ? "addNewWs" : "upgradePlan")
                }
              >
                New Project
              </DropdownMenuItem>
            )}
          </OrgPermissionCan>
        </DropdownMenuContent>
      </DropdownMenu>
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text="You have exceeded the number of projects allowed on the free plan."
      />
      <NewProjectModal
        isOpen={popUp.addNewWs.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("addNewWs", isOpen)}
      />
    </div>
  );
};
