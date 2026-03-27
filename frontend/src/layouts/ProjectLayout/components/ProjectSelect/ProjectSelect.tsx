import { useMemo, useState } from "react";
import { Link, linkOptions, useParams } from "@tanstack/react-router";
import { Check, ChevronsUpDown, Plus, Star } from "lucide-react";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { OrgPermissionCan } from "@app/components/permissions";
import { NewProjectModal } from "@app/components/projects";
import {
  Badge,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
  ProjectIcon,
  UnstableIconButton
} from "@app/components/v3";
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
import { ProjectType } from "@app/hooks/api/projects/types";
import { useUpdateUserProjectFavorites } from "@app/hooks/api/users/mutation";
import { useGetUserProjectFavorites } from "@app/hooks/api/users/queries";

const PROJECT_TYPE_NAME: Record<ProjectType, string> = {
  [ProjectType.SecretManager]: "Secrets Management",
  [ProjectType.CertificateManager]: "PKI",
  [ProjectType.SSH]: "SSH",
  [ProjectType.KMS]: "KMS",
  [ProjectType.PAM]: "PAM",
  [ProjectType.SecretScanning]: "Secret Scanning",
  [ProjectType.AI]: "Agent Sentinel"
};

const ProjectSelectInner = () => {
  const [open, setOpen] = useState(false);
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
      .map((w) => ({
        ...w,
        isFavorite: Boolean(projectFavorites?.includes(w.id))
      }))
      .sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite));

    return projectOptions;
  }, [projects, projectFavorites]);

  const handleSelectProject = (projectId: string) => {
    const workspace = projects.find((p) => p.id === projectId);
    if (!workspace || workspace.id === currentWorkspace.id) {
      setOpen(false);
      return;
    }
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
  };

  return (
    <div className="mr-2 flex min-w-16 items-center gap-1 pr-1 pl-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor className="absolute left-18" />
        <Link
          to={getProjectHomePage(currentWorkspace.type, currentWorkspace.environments)}
          params={{
            projectId: currentWorkspace.id,
            orgId: currentWorkspace.orgId
          }}
          className="group flex cursor-pointer items-center gap-x-2 overflow-hidden text-sm text-white"
        >
          <ProjectIcon className="size-[14px] shrink-0 text-project" />
          <span className="truncate">{currentWorkspace?.name}</span>
          <Badge variant="project" className="mb-hidden lg:inline-flex">
            {currentWorkspace.type ? PROJECT_TYPE_NAME[currentWorkspace.type] : "Project"}
          </Badge>
        </Link>
        <PopoverTrigger asChild>
          <UnstableIconButton variant="ghost" size="xs" aria-label="switch-project">
            <ChevronsUpDown />
          </UnstableIconButton>
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={20} className="w-96 p-0">
          <Command>
            <CommandInput placeholder="Search projects..." />
            <CommandList>
              <CommandEmpty>No projects found.</CommandEmpty>
              <CommandGroup heading="Projects">
                {projectsSortedByFav.map((workspace) => (
                  <CommandItem
                    key={workspace.id}
                    value={`${workspace.name} ${PROJECT_TYPE_NAME[workspace.type]}`}
                    onSelect={() => handleSelectProject(workspace.id)}
                    className="gap-2"
                  >
                    <Check
                      className={
                        currentWorkspace?.id === workspace.id ? "opacity-100" : "opacity-0"
                      }
                    />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm">{workspace.name}</span>
                      <span className="text-[11px] text-muted">
                        {PROJECT_TYPE_NAME[workspace.type]}
                      </span>
                    </div>
                    <UnstableIconButton
                      variant="ghost"
                      size="xs"
                      aria-label="toggle favorite"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={async (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        await (
                          workspace.isFavorite ? removeProjectFromFavorites : addProjectToFavorites
                        )(workspace.id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.stopPropagation();
                      }}
                    >
                      <Star
                        className={
                          workspace.isFavorite
                            ? "fill-yellow-600 text-yellow-600"
                            : "text-yellow-600"
                        }
                      />
                    </UnstableIconButton>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
            <div className="border-t border-border p-1">
              <OrgPermissionCan I={OrgPermissionActions.Create} a={OrgPermissionSubjects.Workspace}>
                {(isOldProjectPermissionAllowed) => (
                  <OrgPermissionCan
                    I={OrgPermissionActions.Create}
                    a={OrgPermissionSubjects.Project}
                  >
                    {(isAllowed) => (
                      <button
                        type="button"
                        disabled={!isAllowed && !isOldProjectPermissionAllowed}
                        className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-foreground hover:bg-foreground/5 disabled:pointer-events-none disabled:opacity-50"
                        onClick={() => {
                          setOpen(false);
                          handlePopUpOpen(isAddingProjectsAllowed ? "addNewWs" : "upgradePlan");
                        }}
                      >
                        <Plus className="size-4" />
                        <span>New Project</span>
                      </button>
                    )}
                  </OrgPermissionCan>
                )}
              </OrgPermissionCan>
            </div>
          </Command>
        </PopoverContent>
      </Popover>
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text="You've reached the maximum number of projects available on the Free plan. Upgrade to the Infisical Pro plan to create more projects."
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
