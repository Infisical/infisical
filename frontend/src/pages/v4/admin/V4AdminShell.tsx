import type { SidebarLevel } from "@infisical/cipher/ui/sidebar";
import { type LinkOptions, Outlet, useRouterState } from "@tanstack/react-router";

import { toV3Href } from "@app/helpers/v4Bridge";

import { v4Path } from "../links";
import { useResolveV4Href } from "../resolveV4Href";
import { V4Shell } from "../shell/V4Shell";
import { adminLocation, adminNav, type AdminNavItem, resourceTabs } from "./navigation";

export const V4AdminShell = () => {
  const location = useRouterState({ select: (state) => state.location });
  const resolve = useResolveV4Href();
  const { selectedTab } = location.search as { selectedTab?: string };
  const at = adminLocation(toV3Href(location.pathname), selectedTab);

  const toItem = (level: string, item: AdminNavItem) => ({
    id: `${level}:${item.id}`,
    label: item.label,
    icon: item.icon,
    link: {
      to: resolve(v4Path(item.path as "/admin")),
      search: item.tab ? { selectedTab: item.tab } : undefined,
      activeOptions: { exact: true, includeSearch: Boolean(item.tab) }
    } as LinkOptions
  });
  const levels: SidebarLevel[] = [
    {
      id: "admin",
      label: "Server console",
      parent: "org",
      sections: [
        {
          items: adminNav.map((item) =>
            item.id === "resources"
              ? { id: "admin:resources", label: item.label, icon: item.icon, level: "resources" }
              : toItem("admin", item)
          )
        }
      ]
    },
    {
      id: "resources",
      label: "Resource overview",
      parent: "admin",
      sections: [{ items: resourceTabs.map((item) => toItem("resources", item)) }]
    }
  ];

  return (
    <V4Shell
      nav={{
        levels,
        current: at.item ? `${at.level}:${at.item.id}` : undefined,
        crumbs: [
          { label: "Server console", href: resolve(v4Path("/admin")) },
          ...(at.level === "resources"
            ? [{ label: "Resource overview", href: resolve(v4Path("/admin/resources/overview")) }]
            : []),
          ...(at.item ? [{ label: at.item.label }] : [])
        ]
      }}
    >
      <Outlet />
    </V4Shell>
  );
};
