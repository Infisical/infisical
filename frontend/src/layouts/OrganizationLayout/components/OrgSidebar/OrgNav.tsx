import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  Cable,
  ChevronRight,
  CreditCard,
  FileText,
  Network,
  Settings,
  Share2,
  Shield
} from "lucide-react";
import { twMerge } from "tailwind-merge";

import {
  OrgIcon,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SubOrgIcon
} from "@app/components/v3";
import { useOrganization, useSubscription } from "@app/context";

import {
  getOrgSettingsSubmenu,
  getSecretSharingSubmenu,
  NETWORKING_SUBMENU,
  ORG_ACCESS_CONTROL_SUBMENU
} from "./submenus";
import { OrgSubmenuView } from "./SubmenuViews";
import type { OrgNavItem, Submenu } from "./types";

// --- Org nav ---

const OrgNav = ({ onSubmenuOpen }: { onSubmenuOpen: (submenu: Submenu) => void }) => {
  const { currentOrg, isRootOrganization, isSubOrganization } = useOrganization();
  const { subscription } = useSubscription();
  const { pathname } = useLocation();
  const orgId = currentOrg.id;

  const items: OrgNavItem[] = [
    {
      label: "Overview",
      icon: isRootOrganization ? OrgIcon : SubOrgIcon,
      to: "/organizations/$orgId/projects",
      isActive: pathname === `/organizations/${orgId}/projects`
    },
    {
      label: "App Connections",
      icon: Cable,
      to: "/organizations/$orgId/app-connections",
      isActive: pathname.startsWith(`/organizations/${orgId}/app-connections`)
    },
    {
      label: "Networking",
      icon: Network,
      to: "/organizations/$orgId/networking",
      isActive: pathname.startsWith(`/organizations/${orgId}/networking`),
      submenu: NETWORKING_SUBMENU
    },
    {
      label: "Secret Sharing",
      icon: Share2,
      to: "/organizations/$orgId/secret-sharing",
      isActive: pathname.startsWith(`/organizations/${orgId}/secret-sharing`),
      submenu: getSecretSharingSubmenu({ isSubOrganization })
    },
    {
      label: "Audit Logs",
      icon: FileText,
      to: "/organizations/$orgId/audit-logs",
      isActive: pathname.startsWith(`/organizations/${orgId}/audit-logs`)
    },
    {
      label: "Access Control",
      icon: Shield,
      to: "/organizations/$orgId/access-management",
      isActive:
        pathname.startsWith(`/organizations/${orgId}/access-management`) ||
        Boolean(pathname.match(/organizations\/[^/]+\/(members|identities|groups|roles)/)),
      submenu: ORG_ACCESS_CONTROL_SUBMENU
    },
    ...(isRootOrganization
      ? [
          {
            label: "Usage & Billing",
            icon: CreditCard,
            to: "/organizations/$orgId/billing",
            isActive: pathname.startsWith(`/organizations/${orgId}/billing`)
          }
        ]
      : []),
    {
      label: "Settings",
      icon: Settings,
      to: "/organizations/$orgId/settings",
      isActive: pathname.startsWith(`/organizations/${orgId}/settings`),
      submenu: getOrgSettingsSubmenu({
        isSubOrganization,
        hasSubOrganization: Boolean(subscription?.subOrganization)
      })
    }
  ];

  return (
    <SidebarMenu>
      {items.map((item) =>
        item.submenu ? (
          <SidebarMenuItem key={item.label}>
            <SidebarMenuButton
              size="lg"
              isActive={item.isActive}
              tooltip={item.label}
              onClick={() => onSubmenuOpen(item.submenu!)}
            >
              <item.icon className="size-4" />
              <span>{item.label}</span>
              <ChevronRight
                className={twMerge(
                  "ml-auto size-4 !text-foreground",
                  !item.isActive && "opacity-50"
                )}
              />
            </SidebarMenuButton>
          </SidebarMenuItem>
        ) : (
          <SidebarMenuItem key={item.label}>
            <SidebarMenuButton asChild isActive={item.isActive} size="lg" tooltip={item.label}>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <Link to={item.to as any} params={{ orgId } as any}>
                <item.icon className="size-4" />
                <span>{item.label}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )
      )}
    </SidebarMenu>
  );
};

// --- Org nav wrapper ---

export const OrgNavWrapper = () => {
  const { currentOrg, isSubOrganization } = useOrganization();
  const { subscription } = useSubscription();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const orgId = currentOrg.id;

  const isOnAccessControl =
    pathname.startsWith(`/organizations/${orgId}/access-management`) ||
    Boolean(pathname.match(/organizations\/[^/]+\/(members|identities|groups|roles)/));
  const isOnSettings = pathname.startsWith(`/organizations/${orgId}/settings`);
  const isOnSecretSharing = pathname.startsWith(`/organizations/${orgId}/secret-sharing`);
  const isOnNetworking = pathname.startsWith(`/organizations/${orgId}/networking`);

  const getInitialSubmenu = (): Submenu | null => {
    if (isOnAccessControl) return ORG_ACCESS_CONTROL_SUBMENU;
    if (isOnSettings)
      return getOrgSettingsSubmenu({
        isSubOrganization,
        hasSubOrganization: Boolean(subscription?.subOrganization)
      });
    if (isOnSecretSharing) return getSecretSharingSubmenu({ isSubOrganization });
    if (isOnNetworking) return NETWORKING_SUBMENU;
    return null;
  };

  const [activeSubmenu, setActiveSubmenu] = useState<Submenu | null>(getInitialSubmenu);

  useEffect(() => {
    setActiveSubmenu(getInitialSubmenu());
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmenuOpen = (submenu: Submenu) => {
    setActiveSubmenu(submenu);
    navigate({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      to: `/organizations/$orgId/${submenu.pathSuffix}` as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      params: { orgId } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      search: { selectedTab: submenu.defaultTab } as any
    });
  };

  return (
    <AnimatePresence mode="wait" initial={false}>
      {activeSubmenu ? (
        <motion.div
          key="submenu"
          initial={{ x: 30, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 30, opacity: 0 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
        >
          <OrgSubmenuView submenu={activeSubmenu} onBack={() => setActiveSubmenu(null)} />
        </motion.div>
      ) : (
        <motion.div
          key="main"
          initial={{ x: -30, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -30, opacity: 0 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
        >
          <SidebarGroup>
            <OrgNav onSubmenuOpen={handleSubmenuOpen} />
          </SidebarGroup>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
