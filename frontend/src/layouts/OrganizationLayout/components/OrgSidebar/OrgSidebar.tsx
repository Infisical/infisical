import { useLocation, useParams } from "@tanstack/react-router";
import { Search } from "lucide-react";

import {
  getGlobalCommandMenuShortcutLabel,
  openGlobalCommandMenu,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger
} from "@app/components/v3";
import { Kbd } from "@app/components/v3/generic/DataGrid/ui/kbd";
import { useOrganization } from "@app/context";
import {
  hasIntermediateProjectsView,
  parseProjectSlugFromPath,
  urlSlugToProjectType
} from "@app/helpers/project";

import { NotificationDropdown } from "../NavBar/NotificationDropdown";
import { OrgNav } from "./OrgNav";
import { ProjectNav } from "./ProjectNav";
import { ProjectTypeNav } from "./ProjectTypeNav";
import { SidebarUserMenu } from "./SidebarUserMenu";

// --- Main sidebar ---

export const OrgSidebar = () => {
  const { projectId, type: typeSlug } = useParams({
    strict: false,
    select: (el) => ({
      projectId: (el as { projectId?: string })?.projectId,
      type: (el as { type?: string })?.type
    })
  });
  const { pathname } = useLocation();
  const isPamRoute = pathname.includes("/pam/");
  const isInsideProject = Boolean(projectId) || isPamRoute;
  // The org-wide KMIP servers and Secret Sharing pages live at literal /projects/<slug>/<resource>
  // paths with no $type route param, so fall back to parsing the product slug from the pathname.
  const effectiveTypeSlug = typeSlug ?? parseProjectSlugFromPath(pathname);
  const projectType = effectiveTypeSlug ? urlSlugToProjectType(effectiveTypeSlug) : null;
  const isOnProjectTypeListing =
    !isInsideProject && Boolean(projectType) && hasIntermediateProjectsView(projectType!);
  const { isSubOrganization } = useOrganization();

  let scope: "project" | "sub-org" | "org" | "pam" = "org";
  if (isPamRoute) scope = "pam";
  else if (isInsideProject || isOnProjectTypeListing) scope = "project";
  else if (isSubOrganization) scope = "sub-org";

  let body: JSX.Element;
  if (isInsideProject) body = <ProjectNav />;
  else if (isOnProjectTypeListing) body = <ProjectTypeNav />;
  else body = <OrgNav />;

  return (
    <Sidebar scope={scope} collapsible="none" side="left">
      <SidebarHeader className="border-b border-border p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              tooltip="Find"
              onClick={openGlobalCommandMenu}
              className="border border-border bg-background/40"
            >
              <Search />
              <span>Find</span>
              <Kbd className="ml-auto group-data-[collapsible=icon]:hidden">
                {getGlobalCommandMenuShortcutLabel()}
              </Kbd>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>{body}</SidebarContent>
      <SidebarFooter className="border-t border-border p-2">
        <div className="flex min-w-0 items-center gap-1">
          <SidebarUserMenu />
          <div className="group-data-[collapsible=icon]:hidden">
            <NotificationDropdown side="right" align="end" />
          </div>
        </div>
        <SidebarTrigger variant="ghost" className="w-full" />
      </SidebarFooter>
    </Sidebar>
  );
};
