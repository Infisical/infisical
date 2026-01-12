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
import { Link, linkOptions, useParams } from "@tanstack/react-router";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
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
  [ProjectType.SecretScanning]: "Secret Scanning",
  [ProjectType.AI]: "Agentic Manager"
};

const ProjectSelectInner = () => {
  const [searchProject, setSearchProject] = useState("");
  const { currentProject: currentWorkspace } = useProject();
  const { currentOrg } = useOrganization();
  const { data: projects = [] } = useGetUserProjects();
  const { data: projectFavorites } = useGetUserProjectFavorites(currentOrg.id);

  const { subscription } = useSubscription();

  const { mutateAsync: updateUserProjectFavorites } = useUpdateUserProjectFavorites();

  const addProjectToFavorites = async (projectId: string) => {
    await updateUserProjectFavorites({
      orgId: currentOrg!.id,
      projectFavorites: [...(projectFavorites || []), projectId]
    });
  };

  const removeProjectFromFavorites = async (projectId: string) => {
    await updateUserProjectFavorites({
      orgId: currentOrg!.id,
      projectFavorites: [...(projectFavorites || []).filter((entry) => entry !== projectId)]
    });
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
    <div className="relative mr-2 flex min-w-16 items-center gap-1 self-end rounded-t-md border-x border-t border-project/10 bg-gradient-to-b from-project/10 to-project/[0.075] pt-1.5 pr-1 pb-2.5 pl-3">
      {/* scott: the below is used to hide the top border from the org nav bar */}
      <div className="absolute -bottom-px left-0 h-px w-full bg-mineshaft-900">
        <div className="h-full bg-project/[0.075]" />
      </div>
      <DropdownMenu modal={false}>
        <Link
          to={getProjectHomePage(currentWorkspace.type, currentWorkspace.environments)}
          params={{
            projectId: currentWorkspace.id,
            orgId: currentWorkspace.orgId
          }}
          className="group flex cursor-pointer items-center gap-x-2 overflow-hidden pt-0.5 text-sm text-white"
        >
          <ProjectIcon className="size-[14px] shrink-0 text-project" />
          <span className="truncate">{currentWorkspace?.name}</span>
          <Badge variant="project" className="hidden lg:inline-flex">
            {currentWorkspace.type ? PROJECT_TYPE_NAME[currentWorkspace.type] : "Project"}
          </Badge>
        </Link>
        <DropdownMenuTrigger asChild>
          <div>
            <IconButton
              variant="plain"
              colorSchema="secondary"
              ariaLabel="switch-project"
              className="top-px px-2 py-1"
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
                          projectId: workspace.id,
                          orgId: workspace.orgId
                        }
                      });
                      const urlInstance = new URL(
                        `${window.location.origin}${url.to.replaceAll("$orgId", url.params.orgId).replaceAll("$projectId", url.params.projectId)}`
                      );
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
        text="You’ve reached the maximum number of projects available on the Free plan. Upgrade to the Infisical Pro plan to create more projects."
      />
      <NewProjectModal
        isOpen={popUp.addNewWs.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("addNewWs", isOpen)}
      />
    </div>
  );
};

export const ProjectSelect = () => {
  const params = useParams({ strict: false });

  // Return null during navigation when projectId is not available
  if (!params.projectId) {
    return null;
  }

  return <ProjectSelectInner />;
};
