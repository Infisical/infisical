import { Link, useLocation, useParams } from "@tanstack/react-router";
import { ChevronLeft, Server, Share2, SlidersHorizontal } from "lucide-react";

import {
  ProjectIcon,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import { parseProjectSlugFromPath, urlSlugToProjectType } from "@app/helpers/project";
import { ProjectType } from "@app/hooks/api/projects/types";

export const ProjectTypeNav = () => {
  const { type: paramTypeSlug, orgId } = useParams({ strict: false }) as {
    type?: string;
    orgId?: string;
  };
  const { pathname } = useLocation();
  const { currentOrg } = useOrganization();
  const resolvedOrgId = orgId ?? currentOrg.id;

  // KMIP servers and Secret Sharing live at literal /projects/<slug>/<resource> paths (no $type
  // param), so fall back to parsing the product slug out of the pathname when it's absent.
  const typeSlug = paramTypeSlug ?? parseProjectSlugFromPath(pathname);
  const isKms = typeSlug === ProjectType.KMS;
  // Secret Manager's URL slug ("secret-management") differs from the enum value ("secret-manager"),
  // so resolve through the helper rather than comparing the slug directly.
  const isSecretManager = typeSlug
    ? urlSlugToProjectType(typeSlug) === ProjectType.SecretManager
    : false;
  const isOnKmipServers = pathname.includes("/kmip-servers");
  const isOnSecretSharing = pathname.includes("/secret-sharing");
  const isOnSecretManagementProductSettings = pathname.includes(
    "/secret-management/product-settings"
  );

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
            closeOnMobile
            isActive={
              !isOnKmipServers && !isOnSecretSharing && !isOnSecretManagementProductSettings
            }
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
              closeOnMobile
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
        {isSecretManager && (
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              scope="project"
              asChild
              closeOnMobile
              isActive={isOnSecretSharing}
              tooltip="Secret Sharing"
            >
              <Link
                to="/organizations/$orgId/projects/secret-management/secret-sharing"
                params={{ orgId: resolvedOrgId }}
              >
                <Share2 className="size-4" />
                <span>Secret Sharing</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )}
        {isSecretManager && (
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              scope="project"
              asChild
              closeOnMobile
              isActive={isOnSecretManagementProductSettings}
              tooltip="Product Settings"
            >
              <Link
                to="/organizations/$orgId/projects/secret-management/product-settings"
                params={{ orgId: resolvedOrgId }}
              >
                <SlidersHorizontal className="size-4" />
                <span>Product Settings</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )}
      </SidebarMenu>
    </SidebarGroup>
  );
};
