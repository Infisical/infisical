import { useState } from "react";
import { Link, useLocation, useMatchRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  Building,
  ChevronLeft,
  ChevronRight,
  Cog,
  Database,
  HardDrive,
  Key,
  Lock,
  Plug,
  Shield,
  ShieldCheck,
  User
} from "lucide-react";

import { SidebarVersionFooter } from "@app/components/navigation/SidebarVersionFooter";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger
} from "@app/components/v3/generic/Sidebar";

type AdminSubmenuItem = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  tab: string;
};

type AdminSubmenu = {
  title: string;
  link: string;
  defaultTab: string;
  items: AdminSubmenuItem[];
};

const RESOURCE_OVERVIEW_SUBMENU: AdminSubmenu = {
  title: "Resource Overview",
  link: "/admin/resources/overview",
  defaultTab: "organizations",
  items: [
    { label: "Organizations", icon: Building, tab: "organizations" },
    { label: "Users", icon: User, tab: "users" },
    { label: "Machine Identities", icon: HardDrive, tab: "identities" }
  ]
};

type AdminNavItem = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  link: string;
  submenu?: AdminSubmenu;
};

const adminNavItems: AdminNavItem[] = [
  { label: "General", icon: Cog, link: "/admin/" },
  {
    label: "Resource Overview",
    icon: Building,
    link: "/admin/resources/overview",
    submenu: RESOURCE_OVERVIEW_SUBMENU
  },
  { label: "Access Control", icon: Shield, link: "/admin/access-management" },
  { label: "Encryption", icon: Lock, link: "/admin/encryption" },
  { label: "Authentication", icon: ShieldCheck, link: "/admin/authentication" },
  { label: "Integrations", icon: Plug, link: "/admin/integrations" },
  { label: "Caching", icon: Database, link: "/admin/caching" },
  { label: "Environment Variables", icon: Key, link: "/admin/environment" }
];

const AdminSubmenuView = ({ submenu, onBack }: { submenu: AdminSubmenu; onBack: () => void }) => {
  const { pathname } = useLocation();
  const searchParams = useSearch({ strict: false }) as Record<string, string>;
  const isOnPage = pathname.startsWith(submenu.link);
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
          const isActive =
            isOnPage && (currentTab === sub.tab || (!currentTab && sub.tab === submenu.defaultTab));

          return (
            <SidebarMenuItem key={sub.label}>
              <SidebarMenuButton size="lg" asChild isActive={isActive} tooltip={sub.label}>
                <Link to={submenu.link} search={{ selectedTab: sub.tab }}>
                  <sub.icon className="size-4" />
                  <span>{sub.label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
};

const AdminNav = ({ onSubmenuOpen }: { onSubmenuOpen: (submenu: AdminSubmenu) => void }) => {
  const matchRoute = useMatchRoute();

  return (
    <SidebarMenu>
      {adminNavItems.map((item) => {
        const isActive = Boolean(matchRoute({ to: item.link, fuzzy: false }));

        if (item.submenu) {
          return (
            <SidebarMenuItem key={item.link}>
              <SidebarMenuButton
                size="lg"
                isActive={isActive}
                tooltip={item.label}
                onClick={() => onSubmenuOpen(item.submenu!)}
              >
                <item.icon className="size-4" />
                <span>{item.label}</span>
                <ChevronRight className="ml-auto size-4 !text-foreground opacity-50" />
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        }

        return (
          <SidebarMenuItem key={item.link}>
            <SidebarMenuButton asChild isActive={isActive} size="lg" tooltip={item.label}>
              <Link to={item.link}>
                <item.icon className="size-4" />
                <span>{item.label}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
};

export const AdminSidebar = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const isOnResources = pathname.startsWith("/admin/resources");

  const [activeSubmenu, setActiveSubmenu] = useState<AdminSubmenu | null>(
    isOnResources ? RESOURCE_OVERVIEW_SUBMENU : null
  );

  const handleSubmenuOpen = (submenu: AdminSubmenu) => {
    setActiveSubmenu(submenu);
    navigate({
      to: submenu.link,
      search: { selectedTab: submenu.defaultTab }
    });
  };

  return (
    <Sidebar scope="admin" collapsible="none" side="left">
      <SidebarContent>
        <AnimatePresence mode="wait" initial={false}>
          {activeSubmenu ? (
            <motion.div
              key="submenu"
              initial={{ x: 30, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 30, opacity: 0 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
            >
              <AdminSubmenuView submenu={activeSubmenu} onBack={() => setActiveSubmenu(null)} />
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
                <AdminNav onSubmenuOpen={handleSubmenuOpen} />
              </SidebarGroup>
            </motion.div>
          )}
        </AnimatePresence>
      </SidebarContent>
      <SidebarVersionFooter />
      <SidebarFooter className="border-t border-border p-2">
        <SidebarTrigger variant="ghost" className="w-full" />
      </SidebarFooter>
    </Sidebar>
  );
};
