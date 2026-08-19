import { useMemo, useState } from "react";
import { Link, linkOptions, useLocation, useParams } from "@tanstack/react-router";
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
  IconButton,
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
  ProjectIcon
} from "@app/components/v3";
import {
  OrgPermissionActions,
  OrgPermissionProjectActions,
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

// Modified and middle clicks belong to the browser: it opens the row's href in a new tab
// or window, so we neither preventDefault nor navigate programmatically on those paths.
const isBrowserHandledClick = (event: React.MouseEvent) =>
  event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;

// The row's anchor exists for its href (new-tab, copy link, status bar preview) while cmdk
// owns activation via onSelect. A plain primary click therefore suppresses the anchor's own
// navigation and bubbles up to cmdk; a browser-handled click is kept away from cmdk instead,
// so the current tab stays put while the new one opens.
const handleRowAnchorClick = (event: React.MouseEvent) => {
  if (isBrowserHandledClick(event)) {
    event.stopPropagation();
    return;
  }
  event.preventDefault();
};

const ProjectSelectInner = () => {
  const [open, setOpen] = useState(false);
  const [selectedValue, setSelectedValue] = useState("");
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
      .filter((w) => w.type === currentWorkspace.type)
      .map((w) => ({
        ...w,
        isFavorite: Boolean(projectFavorites?.includes(w.id))
      }))
      .sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite));

    return projectOptions;
  }, [projects, projectFavorites, currentWorkspace.type]);

  // cmdk activates a row through onSelect, which fires both on pointer click and on
  // Enter for the arrow-key selected row, so all plain activation is funnelled here.
  const handleSelectProject = (projectId: string) => {
    const workspace = projects.find((p) => p.id === projectId);
    if (!workspace || workspace.id === currentWorkspace.id) {
      setOpen(false);
      return;
    }

    // Switching projects reloads the page instead of navigating client-side: React Query
    // throws in the overview when the two projects have a different environment count.
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

  if (
    currentWorkspace.type === ProjectType.CertificateManager ||
    currentWorkspace.type === ProjectType.PAM
  ) {
    return null;
  }

  return (
    <div className="mr-2 flex min-w-16 items-center gap-1 pr-1 pl-1">
      <Popover
        open={open}
        onOpenChange={(nextOpen) => {
          // Clearing on open lets cmdk pick the first row again, as it did while its
          // selection was uncontrolled. Reset here rather than on close so the paths that
          // call setOpen(false) directly cannot leave a stale row selected.
          if (nextOpen) setSelectedValue("");
          setOpen(nextOpen);
        }}
      >
        <PopoverAnchor className="absolute left-18" />
        <Link
          to={getProjectHomePage(currentWorkspace.type, currentWorkspace.environments)}
          params={{
            projectId: currentWorkspace.id,
            orgId: currentWorkspace.orgId
          }}
          className="group flex cursor-pointer items-center gap-x-2 overflow-hidden text-sm text-foreground"
        >
          <ProjectIcon className="size-[14px] shrink-0 text-project" />
          <span className="truncate">{currentWorkspace?.name}</span>
          <Badge variant="project" className="hidden lg:inline-flex">
            Project
          </Badge>
        </Link>
        <PopoverTrigger asChild>
          <IconButton variant="ghost" size="xs" aria-label="switch-project">
            <ChevronsUpDown />
          </IconButton>
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={20} className="w-96 p-0">
          <Command value={selectedValue} onValueChange={setSelectedValue}>
            <CommandInput aria-label="Search projects" placeholder="Search projects..." />
            <CommandList>
              <CommandEmpty>No projects found.</CommandEmpty>
              <CommandGroup heading="Projects">
                {projectsSortedByFav.map((workspace) => (
                  <CommandItem
                    key={workspace.id}
                    value={workspace.id}
                    keywords={[workspace.name]}
                    onSelect={() => handleSelectProject(workspace.id)}
                    className="relative gap-2"
                  >
                    <Check
                      className={
                        currentWorkspace?.id === workspace.id ? "opacity-100" : "opacity-0"
                      }
                    />
                    <div className="flex min-w-0 flex-1 flex-col">
                      {/* The name is the row's link, so its accessible name comes from visible
                          text and its stretched pseudo-element covers the row. Being a tab stop
                          means focus must drive cmdk's selection: cmdk resolves Enter against the
                          row it has marked aria-selected, never against the focused element, so
                          without this onFocus a tabbed-to row would activate whichever row the
                          arrow keys last selected and switch the user to the wrong project. */}
                      <Link
                        to={getProjectHomePage(workspace.type, workspace.environments)}
                        params={{
                          projectId: workspace.id,
                          orgId: workspace.orgId
                        }}
                        className="truncate rounded-sm text-sm outline-0 after:absolute after:inset-0 after:rounded-sm after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-ring"
                        onFocus={() => setSelectedValue(workspace.id)}
                        onClick={handleRowAnchorClick}
                      >
                        {workspace.name}
                      </Link>
                      <span className="truncate text-[11px] text-muted">
                        {workspace.description || "No description"}
                      </span>
                    </div>
                    <IconButton
                      variant="ghost"
                      size="xs"
                      aria-label="toggle favorite"
                      className="relative z-10"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={async (e) => {
                        e.stopPropagation();
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
                          workspace.isFavorite ? "fill-warning text-warning" : "text-warning"
                        }
                      />
                    </IconButton>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
            <div className="border-t border-border p-1">
              <OrgPermissionCan I={OrgPermissionActions.Create} a={OrgPermissionSubjects.Workspace}>
                {(isOldProjectPermissionAllowed) => (
                  <OrgPermissionCan
                    I={OrgPermissionProjectActions.Create}
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
        projectType={currentWorkspace.type}
      />
    </div>
  );
};

export const ProjectSelect = () => {
  const params = useParams({ strict: false });
  const { pathname } = useLocation();

  const isPamRoute = pathname.includes("/pam/");

  if (!params.projectId && !isPamRoute) {
    return null;
  }

  return <ProjectSelectInner />;
};
