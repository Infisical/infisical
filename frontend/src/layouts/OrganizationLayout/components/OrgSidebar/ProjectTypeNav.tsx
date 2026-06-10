import { Link, useLocation, useParams } from "@tanstack/react-router";
import { ChevronLeft, Server } from "lucide-react";

import {
  ProjectIcon,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import { ProjectType } from "@app/hooks/api/projects/types";

export const ProjectTypeNav = () => {
  const { type: paramTypeSlug, orgId } = useParams({ strict: false }) as {
    type?: string;
    orgId?: string;
  };
  const { pathname } = useLocation();
  const { currentOrg } = useOrganization();
  const resolvedOrgId = orgId ?? currentOrg.id;

  // KMIP servers live at a literal /projects/kms/kmip-servers path (no $type param), so fall
  // back to parsing the product slug out of the pathname when the route param is absent.
  const typeSlug = paramTypeSlug ?? pathname.match(/\/projects\/([^/]+)\/kmip-servers/)?.[1];
  const isKms = typeSlug === ProjectType.KMS;
  const isOnKmipServers = pathname.includes("/kmip-servers");

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
          <SidebarMenuButton
            size="lg"
            scope="project"
            asChild
            isActive={!isOnKmipServers}
            tooltip="Projects"
          >
            <Link
              to="/organizations/$orgId/projects/$type"
              params={{ orgId: resolvedOrgId, type: typeSlug ?? "" }}
            >
              <ProjectIcon className="size-4" />
              <span>Projects</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
        {isKms && (
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              scope="project"
              asChild
              isActive={isOnKmipServers}
              tooltip="KMIP Servers"
            >
              <Link
                to="/organizations/$orgId/projects/kms/kmip-servers"
                params={{ orgId: resolvedOrgId }}
              >
                <Server className="size-4" />
                <span>KMIP Servers</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )}
      </SidebarMenu>
    </SidebarGroup>
  );
};
