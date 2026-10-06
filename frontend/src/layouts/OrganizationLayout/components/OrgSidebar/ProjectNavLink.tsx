import { Link, useLocation } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { twMerge } from "tailwind-merge";

import {
  Badge,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebarScope
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import { isOrgScopedProduct } from "@app/helpers/project";

import type { NavItem, Submenu } from "./types";
import { PROJECT_TYPE_PATH } from "./types";

const NAV_DOT_STYLES: Record<
  NonNullable<NavItem["dotVariant"]>,
  { className: string; label: string }
> = {
  danger: { className: "bg-danger", label: "Needs attention" },
  warning: { className: "bg-warning", label: "Needs attention" },
  info: { className: "bg-info", label: "New features available" }
};

const NavDot = ({ variant }: { variant: NonNullable<NavItem["dotVariant"]> }) => (
  <span className="ml-auto flex shrink-0">
    <span
      aria-hidden
      className={twMerge("size-2 rounded-full", NAV_DOT_STYLES[variant].className)}
    />
    <span className="sr-only">{NAV_DOT_STYLES[variant].label}</span>
  </span>
);

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
  const { pathname, search: locationSearch } = useLocation();
  const sidebarScope = useSidebarScope();

  const typePath = PROJECT_TYPE_PATH[currentProject.type];
  const isOrgScoped = isOrgScopedProduct(currentProject.type);
  const basePath = isOrgScoped
    ? `/organizations/${currentOrg.id}/${typePath}`
    : `/organizations/${currentOrg.id}/projects/${typePath}/${currentProject.id}`;
  const fullPath = `${basePath}/${item.pathSuffix}`;

  const activeMatchResult = (() => {
    if (!item.activeMatch) return false;
    if (typeof item.activeMatch === "function") {
      return item.activeMatch(pathname, (locationSearch as Record<string, unknown>) ?? {});
    }
    return item.activeMatch.test(pathname);
  })();
  const pathMatch =
    (item.exactPath ? pathname === fullPath : pathname.startsWith(fullPath)) || activeMatchResult;
  const isActive = item.search
    ? pathMatch &&
      Object.entries(item.search).every(([key, value]) => {
        const urlValue = (locationSearch as Record<string, unknown>)?.[key];
        return urlValue === value || (urlValue === undefined && item.isDefaultSearch);
      })
    : pathMatch;

  if (item.submenu && onSubmenuOpen) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          size="lg"
          scope={sidebarScope}
          isActive={isActive}
          tooltip={item.label}
          onClick={() => onSubmenuOpen(item.submenu!)}
        >
          <item.icon className="size-4" />
          <span>{item.label}</span>
          {Boolean(item.badgeCount) && (
            <Badge variant={item.badgeVariant ?? "warning"} isSquare className="ml-auto">
              {item.badgeCount}
            </Badge>
          )}
          {item.dotVariant && <NavDot variant={item.dotVariant} />}
          <ChevronRight
            className={twMerge(
              "size-4 opacity-50",
              !item.badgeCount && !item.dotVariant && "ml-auto"
            )}
          />
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        size="lg"
        scope={sidebarScope}
        asChild
        closeOnMobile
        isActive={isActive}
        tooltip={item.label}
      >
        <Link
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          to={
            isOrgScoped
              ? (`/organizations/$orgId/${typePath}/${item.pathSuffix}` as any)
              : (`/organizations/$orgId/projects/${typePath}/$projectId/${item.pathSuffix}` as any)
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          params={{ orgId: currentOrg.id, projectId: currentProject.id } as any}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          search={item.search as any}
        >
          <item.icon className="size-4" />
          <span>{item.label}</span>
          {Boolean(item.badgeCount) && (
            <Badge variant={item.badgeVariant ?? "warning"} isSquare className="ml-auto">
              {item.badgeCount}
            </Badge>
          )}
          {item.dotVariant && <NavDot variant={item.dotVariant} />}
        </Link>
      </SidebarMenuButton>
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
  <SidebarMenu>
    {items
      .filter((i) => !i.hidden)
      .map((item) => (
        <ProjectNavLink
          key={item.label}
          item={item}
          onSubmenuOpen={item.submenu ? onSubmenuOpen : undefined}
        />
      ))}
  </SidebarMenu>
);
