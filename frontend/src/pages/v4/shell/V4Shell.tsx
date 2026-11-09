import { type MouseEvent, type ReactNode, useState } from "react";
import {
  type LinkOptions,
  useMatches,
  useNavigate,
  useParams,
  useRouterState
} from "@tanstack/react-router";

import type { BreadcrumbCrumb } from "@app/components/v4/ui/breadcrumb";
import { Button } from "@app/components/v4/ui/button";
import { Icon } from "@app/components/v4/ui/icon";
import { Loader } from "@app/components/v4/ui/loader";
import { Sidebar, type SidebarLevel, type SidebarSection } from "@app/components/v4/ui/sidebar";
import { AppInset, AppShell, PageGutter, TopBar } from "@app/components/v4/ui/top-bar";
import { keepInClassic, toV3Href } from "@app/helpers/v4Bridge";

import { AccessToasts } from "../access/toast";
import { useV4Session } from "../data/session/contract";
import { orgHref } from "../links";
import { V4_DEMO_ORG_ID } from "../mode";
import { useResolveV4Href } from "../resolveV4Href";
import { useShellChrome } from "./chrome";
import { CommandPalette } from "./command-palette";
import { resolveShellLocation } from "./location";
import {
  orgSections,
  products,
  productHome,
  productOf,
  productSections,
  projectBase,
  projectHome,
  settingsSections,
  type ShellNavSection
} from "./navigation";
import { ProjectGate } from "./project-gate";

import styles from "./shell.module.css";

const routeInternalLinks = (event: MouseEvent<HTMLElement>, go: (href: string) => void) => {
  const anchor = (event.target as HTMLElement).closest("a");
  if (
    !anchor ||
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    anchor.target ||
    anchor.hasAttribute("data-open-classic") ||
    anchor.origin !== window.location.origin ||
    !/^\/(v4|organizations)\//.test(anchor.pathname)
  ) {
    return;
  }
  event.preventDefault();
  go(anchor.pathname + anchor.search + anchor.hash);
};

export const V4Shell = ({ children }: { children: ReactNode }) => {
  const { orgId } = useParams({ from: "/v4/organizations/$orgId" });
  const location = useRouterState({ select: (state) => state.location });
  const navigate = useNavigate();
  const session = useV4Session();
  const chrome = useShellChrome();
  const resolve = useResolveV4Href();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const readiness = useMatches({ select: (matches) => matches.at(-1)?.staticData.readiness });
  const [switchingTo, setSwitchingTo] = useState<string>();
  const switching =
    switchingTo !== undefined &&
    switchingTo !== session.organization.id &&
    location.pathname.includes(`/organizations/${switchingTo}/`);
  const organization =
    (switching && session.organizations.find((entry) => entry.id === switchingTo)) ||
    session.organization;
  const base = orgHref(orgId);
  const { selectedTab } = location.search as { selectedTab?: string };
  const at = resolveShellLocation(
    location.pathname.slice(base.length),
    selectedTab,
    session.organization.isSubOrganization
  );
  const go = (href: string) => navigate({ href: resolve(href) });
  const toSidebar = (
    level: string,
    sections: readonly ShellNavSection[],
    opens: Record<string, string> = {}
  ): readonly SidebarSection[] =>
    sections.map((section) => ({
      label: section.label,
      items: section.items.map((item) => ({
        id: `${level}:${item.id}`,
        label: item.label,
        icon: item.icon,
        count: item.count,
        ...(opens[item.id]
          ? { level: opens[item.id] }
          : {
              link: {
                to: resolve(`${base}${item.path}`),
                search: item.search,
                activeOptions: {
                  exact: item.id === "home" || item.id === "projects",
                  includeSearch: Boolean(item.search)
                }
              } as LinkOptions
            })
      }))
    }));

  const product = at.product ? productOf(at.product) : undefined;
  const sidebarCurrent = at.current ?? (at.projectId ? at.sections[0]?.items[0] : undefined);
  const project = session.projects.find((entry) => entry.id === at.projectId);
  const levels: SidebarLevel[] = [
    {
      id: "org",
      label: organization.name,
      sections: toSidebar("org", orgSections(session.organization.isSubOrganization), {
        settings: "settings"
      })
    },
    {
      id: "settings",
      label: "Settings",
      parent: "org",
      sections: toSidebar("settings", settingsSections(session.organization.isSubOrganization))
    }
  ];
  if (product && (at.level === "product" || at.projectId)) {
    levels.push({
      id: "product",
      label: product.label,
      parent: "org",
      sections: toSidebar("product", productSections(product))
    });
  }
  if (at.projectId) {
    levels.push({
      id: at.level,
      label: project?.name ?? at.projectId,
      parent: "product",
      sections: toSidebar(at.level, at.sections)
    });
  } else if (at.level === "pki" || at.level === "scanning" || at.level === "pam") {
    levels.push({
      id: at.level,
      label: product?.label ?? at.level,
      parent: "org",
      sections: toSidebar(at.level, at.sections)
    });
  }

  const orgCrumb: BreadcrumbCrumb = {
    label: organization.name,
    media: <Icon name="building" />,
    href: resolve(`${base}/projects`),
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
        if (id === orgId || orgId === V4_DEMO_ORG_ID) return;
        setSwitchingTo(id);
        go(orgHref(id, "/projects"));
      },
      actions: [
        {
          label: "Organization settings",
          icon: "settings",
          onSelect: () => go(`${base}/settings`)
        },
        ...(orgId === V4_DEMO_ORG_ID
          ? [
              { type: "separator" as const },
              {
                label: "Design system",
                icon: "apps" as const,
                link: { to: "/design-system" as const }
              }
            ]
          : [])
      ]
    }
  };
  const productCrumb: BreadcrumbCrumb | undefined = product && {
    label: product.label,
    media: <Icon name={product.icon} />,
    href: resolve(`${base}${productHome(product)}`),
    switcher: {
      label: "Switch product",
      options: products.map((option) => ({
        value: option.slug,
        label: option.label,
        group: "Products",
        media: <Icon name={option.icon} />,
        onSelect: () => go(`${base}${productHome(option)}`)
      })),
      value: product.slug
    }
  };
  const projectCrumb: BreadcrumbCrumb | undefined =
    product && at.projectId
      ? {
          label: project?.name ?? at.projectId,
          href: resolve(`${base}${projectHome(product.type, at.projectId)}`),
          switcher: {
            label: "Switch project",
            options: session.projects
              .filter((entry) => entry.type === product.type)
              .map((entry) => ({ value: entry.id, label: entry.name })),
            value: at.projectId,
            onChange: (id: string) => {
              const from = `${base}${projectBase(product.type, at.projectId!)}`;
              go(location.pathname.replace(from, `${base}${projectBase(product.type, id)}`));
            }
          }
        }
      : undefined;
  const breadcrumb = [
    orgCrumb,
    ...(at.level === "settings" ? [{ label: "Settings", href: resolve(`${base}/settings`) }] : []),
    ...(productCrumb ? [productCrumb] : []),
    ...(projectCrumb ? [projectCrumb] : []),
    ...(at.current ? [{ label: at.current.label }] : [])
  ];

  const classicHref =
    orgId !== V4_DEMO_ORG_ID && readiness === "partial" ? toV3Href(location.href) : undefined;
  let content = children;
  if (switching) content = <Loader size="page" label="Loading organization" />;
  else if (at.projectId)
    content = (
      <ProjectGate key={at.projectId} projectId={at.projectId}>
        {children}
      </ProjectGate>
    );

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
        search={{ onClick: () => setPaletteOpen(true), label: "Search" }}
        account={chrome.account}
      />
      <Sidebar
        label="Main"
        levels={levels}
        current={sidebarCurrent ? `${at.level}:${sidebarCurrent.id}` : undefined}
        help={chrome.help}
        announcements={chrome.announcements}
      />
      <AppInset>
        <PageGutter className={styles.content}>{content}</PageGutter>
      </AppInset>
      {chrome.dialog}
      <AccessToasts />
      <CommandPalette
        orgId={orgId}
        projectId={at.projectId}
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
      />
    </AppShell>
  );
};
