import { Link, useParams } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";

import {
  ProjectIcon,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from "@app/components/v3";
import { useOrganization } from "@app/context";

export const ProjectTypeNav = () => {
  const { type: typeSlug, orgId } = useParams({ strict: false }) as {
    type?: string;
    orgId?: string;
  };
  const { currentOrg } = useOrganization();
  const resolvedOrgId = orgId ?? currentOrg.id;

  return (
    <SidebarGroup>
      <SidebarGroupLabel asChild>
        <Link
          to="/organizations/$orgId/projects"
          params={{ orgId: resolvedOrgId }}
          className="cursor-pointer hover:bg-foreground/[0.025]"
        >
          <ChevronLeft />
          <span>Organization</span>
        </Link>
      </SidebarGroupLabel>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" scope="project" asChild isActive tooltip="Projects">
            <Link
              to="/organizations/$orgId/projects/$type"
              params={{ orgId: resolvedOrgId, type: typeSlug ?? "" }}
            >
              <ProjectIcon className="size-4" />
              <span>Projects</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  );
};
