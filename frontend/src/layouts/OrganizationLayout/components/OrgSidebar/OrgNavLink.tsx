import { Link, useLocation } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@app/components/v3";
import { useOrganization } from "@app/context";

import type { OrgNavItem } from "./types";

// --- Org nav link (handles normal link, submenu trigger, or custom onClick) ---

export const OrgNavLink = ({
  item,
  onClick
}: {
  item: OrgNavItem;
  /** When provided, the item renders as a button with this handler instead of a link */
  onClick?: () => void;
}) => {
  const { currentOrg } = useOrganization();
  const { pathname, search: locationSearch } = useLocation();
  const orgId = currentOrg.id;

  const pathMatch =
    pathname.startsWith(`/organizations/${orgId}/${item.pathSuffix}`) ||
    Boolean(item.activeMatch?.test(pathname));
  const isActive = item.search
    ? pathMatch &&
      Object.entries(item.search).every(([key, value]) => {
        const urlValue = (locationSearch as Record<string, unknown>)?.[key];
        return urlValue === value || (urlValue === undefined && item.isDefaultSearch);
      })
    : pathMatch;

  if (onClick) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton size="lg" isActive={isActive} tooltip={item.label} onClick={onClick}>
          <item.icon className="size-4" />
          <span>{item.label}</span>
          {item.opensSubmenu && <ChevronRight className="ml-auto size-4 opacity-50" />}
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild closeOnMobile isActive={isActive} size="lg" tooltip={item.label}>
        <Link
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          to={`/organizations/$orgId/${item.pathSuffix}` as any}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          params={{ orgId } as any}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          search={item.search as any}
        >
          <item.icon className="size-4" />
          <span>{item.label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
};

export const OrgNavList = ({
  items,
  onOpenSubmenu
}: {
  items: OrgNavItem[];
  /** Invoked when an item flagged with `opensSubmenu` is clicked */
  onOpenSubmenu?: () => void;
}) => (
  <SidebarMenu>
    {items
      .filter((item) => !item.hidden)
      .map((item) => (
        <OrgNavLink
          key={item.label}
          item={item}
          onClick={item.opensSubmenu ? onOpenSubmenu : undefined}
        />
      ))}
  </SidebarMenu>
);
