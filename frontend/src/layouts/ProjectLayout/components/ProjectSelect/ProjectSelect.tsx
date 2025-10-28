import { useMemo, useState } from "react";
import { faStar } from "@fortawesome/free-regular-svg-icons";
import {
  faCaretDown,
  faCheck,
  faMagnifyingGlass,
  faPlus,
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
import { Badge, ProjectIcon } from "@app/components/v3";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  useOrganization,
  useProject,
  useSubscription
} from "@app/context";
import { getProjectHomePage } from "@app/helpers/project";
import { usePopUp } from "@app/hooks";
import { useGetUserProjects } from "@app/hooks/api";
import { Project, ProjectType } from "@app/hooks/api/projects/types";
import { useUpdateUserProjectFavorites } from "@app/hooks/api/users/mutation";
import { useGetUserProjectFavorites } from "@app/hooks/api/users/queries";

const PROJECT_TYPE_NAME: Record<ProjectType, string> = {
  [ProjectType.SecretManager]: "Secrets Management",
  [ProjectType.CertificateManager]: "PKI",
  [ProjectType.SSH]: "SSH",
  [ProjectType.KMS]: "KMS",
  [ProjectType.PAM]: "PAM",
  [ProjectType.SecretScanning]: "Secret Scanning"
};

export const ProjectSelect = () => {
  const [searchProject, setSearchProject] = useState("");
  const { currentProject: currentWorkspace } = useProject();
  const { currentOrg } = useOrganization();
  const { data: projects = [] } = useGetUserProjects();
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

  const projectsSortedByFav = useMemo(() => {
    const projectOptions = projects
      .map((w): Project & { isFavorite: boolean } => ({
        ...w,
        isFavorite: Boolean(projectFavorites?.includes(w.id))
      }))
      .sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite));

    return projectOptions;
  }, [projects, projectFavorites, currentWorkspace]);

  return (
    <div className="mr-2 flex items-center gap-1 overflow-hidden">
      <DropdownMenu modal={false}>
        <Link
          to={getProjectHomePage(currentWorkspace.type, currentWorkspace.environments)}
          params={{
            projectId: currentWorkspace.id
          }}
          className="group flex cursor-pointer items-center gap-x-1.5 overflow-hidden hover:text-white"
        >
          <p className="inline-block truncate text-mineshaft-200 group-hover:underline">
            {currentWorkspace?.name}
          </p>
          <Badge variant="project">
            <ProjectIcon />
            {currentWorkspace.type ? PROJECT_TYPE_NAME[currentWorkspace.type] : "Project"}
          </Badge>
        </Link>
        <DropdownMenuTrigger asChild>
          <div>
            <IconButton
              variant="plain"
              colorSchema="secondary"
              ariaLabel="switch-project"
              className="px-2 py-1"
            >
              <FontAwesomeIcon icon={faCaretDown} className="text-xs text-bunker-300" />
            </IconButton>
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          side="bottom"
          className="mt-6 cursor-default p-1 shadow-mineshaft-600 drop-shadow-md"
          style={{ minWidth: "220px" }}
        >
          <div className="px-2 py-1 text-xs text-mineshaft-400 capitalize">Projects</div>
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
          <div className="max-h-80 thin-scrollbar overflow-auto">
            {projectsSortedByFav
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
                        to: getProjectHomePage(workspace.type, workspace.environments),
                        params: {
                          projectId: workspace.id
                        },
                        search: {
                          subOrganization: currentOrg?.subOrganization?.name
                        }
                      });
                      const urlInstance = new URL(
                        `${window.location.origin}/${url.to.replaceAll("$projectId", workspace.id)}`
                      );
                      if (currentOrg?.subOrganization) {
                        urlInstance.searchParams.set(
                          "subOrganization",
                          currentOrg.subOrganization.name
                        );
                      }
                      window.location.assign(urlInstance);
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
                          <div className="max-w-40 truncate overflow-hidden whitespace-nowrap">
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
            {(isOldProjectPermissionAllowed) => (
              <OrgPermissionCan I={OrgPermissionActions.Create} a={OrgPermissionSubjects.Project}>
                {(isAllowed) => (
                  <DropdownMenuItem
                    isDisabled={!isAllowed && !isOldProjectPermissionAllowed}
                    icon={<FontAwesomeIcon icon={faPlus} />}
                    onClick={() =>
                      handlePopUpOpen(isAddingProjectsAllowed ? "addNewWs" : "upgradePlan")
                    }
                  >
                    New Project
                  </DropdownMenuItem>
                )}
              </OrgPermissionCan>
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
