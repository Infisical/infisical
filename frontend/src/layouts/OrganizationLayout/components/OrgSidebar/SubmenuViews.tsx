import { Link, useLocation, useSearch } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";

import {
  Badge,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
  useSidebarScope
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import { ProjectType } from "@app/hooks/api/projects/types";

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
  const { setOpenMobile } = useSidebar();

  const typePath = PROJECT_TYPE_PATH[currentProject.type];
  const sidebarScope = useSidebarScope();
  const isPam = currentProject.type === ProjectType.PAM;
  const basePath = isPam
    ? `/organizations/${currentOrg.id}/pam`
    : `/organizations/${currentOrg.id}/projects/${typePath}/${currentProject.id}`;
  const isOnExactPage = pathname.startsWith(`${basePath}/${submenu.pathSuffix}`);
  const currentTab = searchParams?.selectedTab;
  const anyItemMatchesDetail = submenu.items.some((s) => Boolean(s.activeMatch?.test(pathname)));

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
              !anyItemMatchesDetail &&
              (currentTab === sub.tab || (!currentTab && sub.tab === submenu.defaultTab)));

          return (
            <SidebarMenuItem key={sub.label}>
              <SidebarMenuButton
                size="lg"
                scope={sidebarScope}
                asChild
                isActive={isActive}
                tooltip={sub.label}
              >
                <Link
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  to={
                    isPam
                      ? (`/organizations/$orgId/pam/${submenu.pathSuffix}` as any)
                      : (`/organizations/$orgId/projects/${typePath}/$projectId/${submenu.pathSuffix}` as any)
                  }
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  params={{ orgId: currentOrg.id, projectId: currentProject.id } as any}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  search={{ selectedTab: sub.tab } as any}
                  onClick={() => setOpenMobile(false)}
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
