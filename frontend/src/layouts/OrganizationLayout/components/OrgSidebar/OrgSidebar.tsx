import { useLocation, useParams } from "@tanstack/react-router";

import { Sidebar, SidebarContent, SidebarFooter, SidebarTrigger } from "@app/components/v3";
import { useOrganization } from "@app/context";
import {
  getOrgScopedProductFromPath,
  hasIntermediateProjectsView,
  parseProjectSlugFromPath,
  urlSlugToProjectType
} from "@app/helpers/project";
import { ProjectType } from "@app/hooks/api/projects/types";

import { OrgNav } from "./OrgNav";
import { ProjectNav } from "./ProjectNav";
import { ProjectTypeNav } from "./ProjectTypeNav";

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
  const orgScopedProduct = getOrgScopedProductFromPath(pathname);
  const isInsideProject = Boolean(projectId) || Boolean(orgScopedProduct);
  // The org-wide KMIP servers and Secret Sharing pages live at literal /projects/<slug>/<resource>
  // paths with no $type route param, so fall back to parsing the product slug from the pathname.
  const effectiveTypeSlug = typeSlug ?? parseProjectSlugFromPath(pathname);
  const projectType = effectiveTypeSlug ? urlSlugToProjectType(effectiveTypeSlug) : null;
  const isOnProjectTypeListing =
    !isInsideProject && Boolean(projectType) && hasIntermediateProjectsView(projectType!);
  const { isSubOrganization } = useOrganization();

  let scope: "project" | "sub-org" | "org" | "pam" | "agent-vault" = "org";
  if (orgScopedProduct === ProjectType.PAM) scope = "pam";
  else if (orgScopedProduct === ProjectType.AgentVault) scope = "agent-vault";
  else if (isInsideProject || isOnProjectTypeListing) scope = "project";
  else if (isSubOrganization) scope = "sub-org";

  let body: JSX.Element;
  if (isInsideProject) body = <ProjectNav />;
  else if (isOnProjectTypeListing) body = <ProjectTypeNav />;
  else body = <OrgNav />;

  return (
    <Sidebar scope={scope} collapsible="none" side="left">
      <SidebarContent>{body}</SidebarContent>
      <SidebarFooter className="border-t border-border p-2">
        <SidebarTrigger variant="ghost" className="w-full" />
      </SidebarFooter>
    </Sidebar>
  );
};
