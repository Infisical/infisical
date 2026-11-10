import type { IconName } from "@app/components/v4/ui/icon";

export type AdminNavItem = {
  id: string;
  label: string;
  icon: IconName;
  path: string;
  tab?: string;
};

export const RESOURCES_PATH = "/admin/resources/overview";

export const resourceTabs = [
  {
    id: "organizations",
    label: "Organizations",
    icon: "building",
    path: RESOURCES_PATH,
    tab: "organizations"
  },
  { id: "users", label: "Users", icon: "user", path: RESOURCES_PATH, tab: "users" },
  {
    id: "identities",
    label: "Machine identities",
    icon: "machine",
    path: RESOURCES_PATH,
    tab: "identities"
  },
  {
    id: "emailDomains",
    label: "Email domains",
    icon: "globe",
    path: RESOURCES_PATH,
    tab: "emailDomains"
  }
] as const satisfies readonly AdminNavItem[];

export const adminNav = [
  { id: "general", label: "General", icon: "settings", path: "/admin" },
  { id: "resources", label: "Resource overview", icon: "apps", path: RESOURCES_PATH },
  { id: "access", label: "Access control", icon: "user-plus", path: "/admin/access-management" },
  { id: "encryption", label: "Encryption", icon: "lock", path: "/admin/encryption" },
  { id: "authentication", label: "Authentication", icon: "key", path: "/admin/authentication" },
  { id: "integrations", label: "Integrations", icon: "link", path: "/admin/integrations" },
  { id: "caching", label: "Caching", icon: "sync", path: "/admin/caching" },
  {
    id: "environment",
    label: "Environment variables",
    icon: "terminal",
    path: "/admin/environment"
  }
] as const satisfies readonly AdminNavItem[];

export const adminLocation = (pathname: string, selectedTab?: string) => {
  const path = pathname.replace(/(.)\/$/, "$1");
  if (path === RESOURCES_PATH) {
    const tab = resourceTabs.find((entry) => entry.tab === selectedTab) ?? resourceTabs[0];
    return { level: "resources" as const, item: tab };
  }
  return { level: "admin" as const, item: adminNav.find((entry) => entry.path === path) };
};
