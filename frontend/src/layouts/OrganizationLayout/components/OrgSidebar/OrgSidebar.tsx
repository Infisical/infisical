import { useParams } from "@tanstack/react-router";

import { Sidebar, SidebarContent, SidebarFooter, SidebarTrigger } from "@app/components/v3";
import { useOrganization } from "@app/context";

import { OrgNavWrapper } from "./OrgNav";
import { ProjectNav } from "./ProjectNav";

// --- Main sidebar ---

export const OrgSidebar = () => {
  const projectId = useParams({
    strict: false,
    select: (el) => el?.projectId
  });
  const isInsideProject = Boolean(projectId);
  const { isSubOrganization } = useOrganization();

  let scope: "project" | "sub-org" | "org" = "org";
  if (isInsideProject) scope = "project";
  else if (isSubOrganization) scope = "sub-org";

  return (
    <Sidebar scope={scope} collapsible="none" side="left">
      <SidebarContent>{isInsideProject ? <ProjectNav /> : <OrgNavWrapper />}</SidebarContent>
      <SidebarFooter className="border-t border-border p-2">
        <SidebarTrigger variant="ghost" className="w-full" />
      </SidebarFooter>
    </Sidebar>
  );
};
