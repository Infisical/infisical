import { type LinkOptions, Outlet, useRouterState } from "@tanstack/react-router";

import { toV3Href } from "@app/helpers/v4Bridge";

import { v4Path } from "../links";
import { useResolveV4Href } from "../resolveV4Href";
import type { V4ShellLevel } from "../shell/levels";
import { V4Shell } from "../shell/V4Shell";
import { adminLocation, adminNav, type AdminNavItem, resourceTabs } from "./navigation";

export const V4AdminShell = () => {
  const location = useRouterState({ select: (state) => state.location });
  const resolve = useResolveV4Href();
  const { selectedTab } = location.search as { selectedTab?: string };
  const at = adminLocation(toV3Href(location.pathname), selectedTab);

  const linkOf = (item: AdminNavItem) =>
    ({
      to: resolve(v4Path(item.path as "/admin")),
      search: item.tab ? { selectedTab: item.tab } : undefined
    }) as LinkOptions;
  const toItem = (level: string, item: AdminNavItem) => ({
    id: `${level}:${item.id}`,
    label: item.label,
    icon: item.icon,
    link: { ...linkOf(item), activeOptions: { exact: true, includeSearch: Boolean(item.tab) } }
  });
  const resources: V4ShellLevel = {
    id: "resources",
    label: "Resource overview",
    landing: linkOf(resourceTabs[0]),
    sections: [{ items: resourceTabs.map((item) => toItem("resources", item)) }]
  };
  const admin: V4ShellLevel = {
    id: "admin",
    label: "Server console",
    landing: linkOf(adminNav[0]),
    sections: [
      {
        items: adminNav.map((item) =>
          item.id === "resources"
            ? { ...toItem("admin", item), drillIn: true, link: resources.landing }
            : toItem("admin", item)
        )
      }
    ]
  };
  const levels = at.level === "resources" ? [admin, resources] : [admin];

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
