import { type MouseEvent, type ReactNode, useState } from "react";
import { type LinkOptions, useNavigate, useParams, useRouterState } from "@tanstack/react-router";

import type { BreadcrumbCrumb } from "@app/components/v4/ui/breadcrumb";
import { Icon } from "@app/components/v4/ui/icon";
import { Sidebar, type SidebarLevel, type SidebarSection } from "@app/components/v4/ui/sidebar";
import { AppInset, AppShell, PageGutter, TopBar } from "@app/components/v4/ui/top-bar";

import { useV4Session } from "../data/session/contract";
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
  const base = `/v4/organizations/${orgId}`;
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
  const project = session.projects.find((entry) => entry.id === at.projectId);
  const levels: SidebarLevel[] = [
    {
      id: "org",
      label: session.organization.name,
      sections: toSidebar("org", orgSections, { settings: "settings" })
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
    label: session.organization.name,
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
      value: session.organization.id,
      onChange: (id: string) => {
        if (id !== orgId && orgId !== V4_DEMO_ORG_ID) go(`/v4/organizations/${id}/projects`);
      },
      actions: [
        {
          label: "Organization settings",
          icon: "settings",
          onSelect: () => go(`${base}/settings`)
        },
        { type: "separator" },
        {
          label: "Design system",
          icon: "apps",
          link: { to: "/design-system" }
        }
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
          mono: true,
          href: resolve(`${base}${projectHome(product.type, at.projectId)}`),
          switcher: {
            label: "Switch project",
            options: session.projects
              .filter((entry) => entry.type === product.type)
              .map((entry) => ({ value: entry.id, label: entry.name, mono: true })),
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

  return (
    <AppShell style={{ height: "100%" }} onClickCapture={(event) => routeInternalLinks(event, go)}>
      <TopBar
        breadcrumb={breadcrumb}
        search={{ onClick: () => setPaletteOpen(true), label: "Search" }}
        account={chrome.account}
      />
      <Sidebar
        label="Main"
        levels={levels}
        current={at.current ? `${at.level}:${at.current.id}` : undefined}
        help={chrome.help}
        announcements={chrome.announcements}
      />
      <AppInset>
        <PageGutter>
          {at.projectId ? (
            <ProjectGate key={at.projectId} projectId={at.projectId}>
              {children}
            </ProjectGate>
          ) : (
            children
          )}
        </PageGutter>
      </AppInset>
      {chrome.dialog}
      <CommandPalette
        orgId={orgId}
        projectId={at.projectId}
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
      />
    </AppShell>
  );
};
