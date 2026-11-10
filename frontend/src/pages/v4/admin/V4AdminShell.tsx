import {
  type LinkOptions,
  Outlet,
  useMatches,
  useNavigate,
  useRouterState
} from "@tanstack/react-router";

import type { BreadcrumbCrumb } from "@app/components/v4/ui/breadcrumb";
import { Button } from "@app/components/v4/ui/button";
import { Icon } from "@app/components/v4/ui/icon";
import { Sidebar, type SidebarLevel } from "@app/components/v4/ui/sidebar";
import { AppInset, AppShell, PageGutter, TopBar } from "@app/components/v4/ui/top-bar";
import { keepInClassic, toV3Href } from "@app/helpers/v4Bridge";

import { useV4Mode } from "../data/adapters";
import { useV4Session } from "../data/session/contract";
import { orgHref, v4Path } from "../links";
import { useResolveV4Href } from "../resolveV4Href";
import { useShellChrome } from "../shell/chrome";
import { routeInternalLinks } from "../shell/V4Shell";
import { adminLocation, adminNav, type AdminNavItem, resourceTabs } from "./navigation";

import styles from "../shell/shell.module.css";

export const V4AdminShell = () => {
  const location = useRouterState({ select: (state) => state.location });
  const navigate = useNavigate();
  const session = useV4Session();
  const chrome = useShellChrome();
  const resolve = useResolveV4Href();
  const live = useV4Mode() === "live";
  const readiness = useMatches({ select: (matches) => matches.at(-1)?.staticData.readiness });
  const go = (href: string) => navigate({ href: resolve(href) });
  const { selectedTab } = location.search as { selectedTab?: string };
  const at = adminLocation(toV3Href(location.pathname), selectedTab);
  const { organization } = session;

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

  const breadcrumb: BreadcrumbCrumb[] = [
    {
      label: organization.name,
      media: <Icon name="building" />,
      href: resolve(orgHref(organization.id, "/projects")),
      switcher: {
        label: "Switch organization",
        searchable: true,
        placeholder: "Search organizations",
        maxHeight: 400,
        options: session.organizations.map((entry) => ({
          value: entry.id,
          label: entry.name,
          group: entry.group,
          media: entry.group === "Sub-organizations" ? undefined : <Icon name="building" />
        })),
        value: organization.id,
        onChange: (id: string) => {
          if (live) go(orgHref(id, "/projects"));
        }
      }
    },
    { label: "Server console", href: resolve(v4Path("/admin")) },
    ...(at.level === "resources"
      ? [{ label: "Resource overview", href: resolve(v4Path("/admin/resources/overview")) }]
      : []),
    ...(at.item ? [{ label: at.item.label }] : [])
  ];

  const classicHref = live && readiness === "partial" ? toV3Href(location.href) : undefined;

  return (
    <AppShell style={{ height: "100%" }} onClickCapture={(event) => routeInternalLinks(event, go)}>
      <TopBar
        breadcrumb={breadcrumb}
        actions={
          classicHref && (
            <Button variant="link" underline="hover" asChild>
              <a
                href={classicHref}
                data-open-classic
                onClick={(event) => {
                  keepInClassic(classicHref);
                  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey)
                    return;
                  event.preventDefault();
                  navigate({ href: classicHref });
                }}
              >
                Open in classic
              </a>
            </Button>
          )
        }
        account={chrome.account}
      />
      <Sidebar
        label="Server console"
        levels={levels}
        current={at.item ? `${at.level}:${at.item.id}` : undefined}
        help={chrome.help}
        announcements={chrome.announcements}
      />
      <AppInset>
        <PageGutter className={styles.content}>
          <Outlet />
        </PageGutter>
      </AppInset>
      {chrome.dialog}
    </AppShell>
  );
};
