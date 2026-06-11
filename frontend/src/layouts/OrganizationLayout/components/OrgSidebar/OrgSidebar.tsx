import { useLocation, useParams } from "@tanstack/react-router";

import { Sidebar, SidebarContent, SidebarFooter, SidebarTrigger } from "@app/components/v3";
import { useOrganization } from "@app/context";
import { hasIntermediateProjectsView, urlSlugToProjectType } from "@app/helpers/project";

import { OrgNavWrapper } from "./OrgNav";
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
  const isInsideProject = Boolean(projectId);
  // The org-wide KMIP servers pages live at a literal /projects/<type>/kmip-servers path with no
  // $type route param, so fall back to parsing the product slug from the pathname.
  const effectiveTypeSlug = typeSlug ?? pathname.match(/\/projects\/([^/]+)\/kmip-servers/)?.[1];
  const projectType = effectiveTypeSlug ? urlSlugToProjectType(effectiveTypeSlug) : null;
  const isOnProjectTypeListing =
    !isInsideProject && Boolean(projectType) && hasIntermediateProjectsView(projectType!);
  const { isSubOrganization } = useOrganization();

  let scope: "project" | "sub-org" | "org" = "org";
  if (isInsideProject || isOnProjectTypeListing) scope = "project";
  else if (isSubOrganization) scope = "sub-org";

  let body: JSX.Element;
  if (isInsideProject) body = <ProjectNav />;
  else if (isOnProjectTypeListing) body = <ProjectTypeNav />;
  else body = <OrgNavWrapper />;

  return (
    <Sidebar scope={scope} collapsible="none" side="left">
      <SidebarContent>{body}</SidebarContent>
      <SidebarFooter className="border-t border-border p-2">
        <SidebarTrigger variant="ghost" className="w-full" />
      </SidebarFooter>
    </Sidebar>
  );
};
