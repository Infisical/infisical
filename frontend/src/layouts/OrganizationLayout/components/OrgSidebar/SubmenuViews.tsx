import { Link, useLocation, useSearch } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";

import {
  Badge,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";

import type { Submenu } from "./types";
import { PROJECT_TYPE_PATH } from "./types";

// --- Generic submenu view for projects ---

export const ProjectSubmenuView = ({
  submenu,
  onBack
}: {
  submenu: Submenu;
  onBack: () => void;
}) => {
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const { pathname } = useLocation();
  const searchParams = useSearch({ strict: false }) as Record<string, string>;

  const typePath = PROJECT_TYPE_PATH[currentProject.type];
  const basePath = `/organizations/${currentOrg.id}/projects/${typePath}/${currentProject.id}`;
  const isOnExactPage = pathname.startsWith(`${basePath}/${submenu.pathSuffix}`);
  const currentTab = searchParams?.selectedTab;

  return (
    <SidebarGroup>
      <SidebarGroupLabel asChild>
        <button
          className="cursor-pointer hover:bg-foreground/[0.025]"
          type="button"
          onClick={onBack}
        >
          <ChevronLeft />
          <span>{submenu.title}</span>
        </button>
      </SidebarGroupLabel>
      <SidebarMenu>
        {submenu.items.map((sub) => {
          const matchesDetail = Boolean(sub.activeMatch?.test(pathname));
          const isActive =
            matchesDetail ||
            (isOnExactPage &&
              (currentTab === sub.tab || (!currentTab && sub.tab === submenu.defaultTab)));

          return (
            <SidebarMenuItem key={sub.label}>
              <SidebarMenuButton
                size="lg"
                scope="project"
                asChild
                isActive={isActive}
                tooltip={sub.label}
              >
                <Link
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  to={
                    `/organizations/$orgId/projects/${typePath}/$projectId/${submenu.pathSuffix}` as any
                  }
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  params={{ orgId: currentOrg.id, projectId: currentProject.id } as any}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  search={{ selectedTab: sub.tab } as any}
                >
                  <sub.icon className="size-4" />
                  <span>{sub.label}</span>
                </Link>
              </SidebarMenuButton>
              {Boolean(sub.badgeCount) && (
                <Badge variant="warning" className="absolute top-[10.5px] right-4">
                  {sub.badgeCount}
                </Badge>
              )}
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
};

// --- Generic submenu view for org ---

export const OrgSubmenuView = ({ submenu, onBack }: { submenu: Submenu; onBack: () => void }) => {
  const { currentOrg } = useOrganization();
  const { pathname } = useLocation();
  const searchParams = useSearch({ strict: false }) as Record<string, string>;
  const orgId = currentOrg.id;

  const isOnExactPage = pathname.startsWith(`/organizations/${orgId}/${submenu.pathSuffix}`);
  const currentTab = searchParams?.selectedTab;

  return (
    <SidebarGroup>
      <SidebarGroupLabel asChild>
        <button
          className="cursor-pointer hover:bg-foreground/[0.025]"
          type="button"
          onClick={onBack}
        >
          <ChevronLeft />
          <span>{submenu.title}</span>
        </button>
      </SidebarGroupLabel>
      <SidebarMenu>
        {submenu.items.map((sub) => {
          const matchesDetail = Boolean(sub.activeMatch?.test(pathname));
          const isActive =
            matchesDetail ||
            (isOnExactPage &&
              (currentTab === sub.tab || (!currentTab && sub.tab === submenu.defaultTab)));

          return (
            <SidebarMenuItem key={sub.label}>
              <SidebarMenuButton size="lg" asChild isActive={isActive} tooltip={sub.label}>
                <Link
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  to={`/organizations/$orgId/${submenu.pathSuffix}` as any}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  params={{ orgId } as any}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  search={{ selectedTab: sub.tab } as any}
                >
                  <sub.icon className="size-4" />
                  <span>{sub.label}</span>
                </Link>
              </SidebarMenuButton>
              {Boolean(sub.badgeCount) && (
                <Badge variant="warning" className="absolute top-[10.5px] right-4">
                  {sub.badgeCount}
                </Badge>
              )}
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
};
