import { Link, useLocation } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { Badge, SidebarMenuButton, SidebarMenuItem } from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";

import type { NavItem, Submenu } from "./types";
import { PROJECT_TYPE_PATH } from "./types";

// --- Project nav link (handles submenu chevron or normal link) ---

export const ProjectNavLink = ({
  item,
  onSubmenuOpen
}: {
  item: NavItem;
  onSubmenuOpen?: (submenu: Submenu) => void;
}) => {
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const { pathname } = useLocation();

  const typePath = PROJECT_TYPE_PATH[currentProject.type];
  const basePath = `/organizations/${currentOrg.id}/projects/${typePath}/${currentProject.id}`;
  const fullPath = `${basePath}/${item.pathSuffix}`;
  const isActive = pathname.startsWith(fullPath) || Boolean(item.activeMatch?.test(pathname));

  if (item.submenu && onSubmenuOpen) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          size="lg"
          scope="project"
          isActive={isActive}
          tooltip={item.label}
          onClick={() => onSubmenuOpen(item.submenu!)}
        >
          <item.icon className="size-4" />
          <span>{item.label}</span>
          {Boolean(item.badgeCount) && (
            <Badge variant="warning" isSquare className="ml-auto">
              {item.badgeCount}
            </Badge>
          )}
          <ChevronRight className={twMerge("size-4 opacity-50", !item.badgeCount && "ml-auto")} />
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton size="lg" scope="project" asChild isActive={isActive} tooltip={item.label}>
        <Link
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          to={`/organizations/$orgId/projects/${typePath}/$projectId/${item.pathSuffix}` as any}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          params={{ orgId: currentOrg.id, projectId: currentProject.id } as any}
        >
          <item.icon className="size-4" />
          <span>{item.label}</span>
        </Link>
      </SidebarMenuButton>
      {Boolean(item.badgeCount) && (
        <Badge variant="warning" className="absolute top-[10.5px] right-4">
          {item.badgeCount}
        </Badge>
      )}
    </SidebarMenuItem>
  );
};

export const ProjectNavList = ({
  items,
  onSubmenuOpen
}: {
  items: NavItem[];
  onSubmenuOpen: (submenu: Submenu) => void;
}) => (
  <>
    {items
      .filter((i) => !i.hidden)
      .map((item) => (
        <ProjectNavLink
          key={item.label}
          item={item}
          onSubmenuOpen={item.submenu ? onSubmenuOpen : undefined}
        />
      ))}
  </>
);
