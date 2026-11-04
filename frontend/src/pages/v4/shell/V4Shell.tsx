import type { MouseEvent, ReactNode } from "react";
import { useNavigate, useParams, useRouterState } from "@tanstack/react-router";

import type { BreadcrumbCrumb } from "@app/components/v4/ui/breadcrumb";
import { Icon } from "@app/components/v4/ui/icon";
import { Sidebar, type SidebarSection } from "@app/components/v4/ui/sidebar";
import { AppInset, AppShell, PageGutter, TopBar } from "@app/components/v4/ui/top-bar";

import { useV4Session } from "../data/session/contract";
import { V4_DEMO_ORG_ID } from "../mode";
import { useShellChrome } from "./chrome";
import { resolveShellLocation } from "./location";
import {
  products,
  productHome,
  productOf,
  projectBase,
  type ShellNavItem,
  type ShellNavSection
} from "./navigation";

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
    !anchor.pathname.startsWith("/v4/")
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
  const base = `/v4/organizations/${orgId}`;
  const { selectedTab } = location.search as { selectedTab?: string };
  const at = resolveShellLocation(
    location.pathname.slice(base.length),
    selectedTab,
    session.organization.isSubOrganization
  );
  const go = (href: string) => navigate({ href });
  const href = (item: Pick<ShellNavItem, "path" | "search">) =>
    `${base}${item.path}${item.search ? `?${new URLSearchParams(item.search)}` : ""}`;
  const toSidebar = (sections: readonly ShellNavSection[]): readonly SidebarSection[] =>
    sections.map((section) => ({
      label: section.label,
      items: section.items.map((item) => ({
        id: item.id,
        label: item.label,
        icon: item.icon,
        count: item.count,
        drillIn: item.drillIn,
        href: href(item)
      }))
    }));

  const product = at.product ? productOf(at.product) : undefined;
  const project = session.projects.find((entry) => entry.id === at.projectId);
  const back =
    product && at.projectId
      ? { label: product.label, path: `/projects/${product.slug}` }
      : { label: session.organization.name, path: "/projects" };

  const orgCrumb: BreadcrumbCrumb = {
    label: session.organization.name,
    media: <Icon name="building" />,
    href: `${base}/projects`,
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
        }
      ]
    }
  };
  const productCrumb: BreadcrumbCrumb | undefined = product && {
    label: product.label,
    media: <Icon name={product.icon} />,
    href: `${base}${productHome(product)}`,
    switcher: {
      label: "Switch product",
      options: products.map((option) => ({
        value: option.slug,
        label: option.label,
        group: "Products",
        media: <Icon name={option.icon} />
      })),
      value: product.slug,
      onChange: (slug: string) => {
        const next = products.find((option) => option.slug === slug);
        if (next) go(`${base}${productHome(next)}`);
      }
    }
  };
  const projectCrumb: BreadcrumbCrumb | undefined =
    product && at.projectId
      ? {
          label: project?.name ?? at.projectId,
          mono: true,
          href: `${base}${projectBase(product.type, at.projectId)}/overview`,
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
    ...(at.level === "settings" ? [{ label: "Settings", href: `${base}/settings` }] : []),
    ...(productCrumb ? [productCrumb] : []),
    ...(projectCrumb ? [projectCrumb] : []),
    ...(at.current ? [{ label: at.current.label }] : [])
  ];

  return (
    <AppShell style={{ height: "100%" }} onClickCapture={(event) => routeInternalLinks(event, go)}>
      <TopBar breadcrumb={breadcrumb} account={chrome.account} />
      <Sidebar
        label="Main"
        sections={at.level === "org" ? toSidebar(at.sections) : undefined}
        scope={
          at.level === "org"
            ? undefined
            : {
                id: at.level,
                back: { id: `back-${at.level}`, label: back.label, href: href(back) },
                sections: toSidebar(at.sections)
              }
        }
        current={at.current?.id}
        help={chrome.help}
        announcements={chrome.announcements}
      />
      <AppInset>
        <PageGutter>{children}</PageGutter>
      </AppInset>
      {chrome.dialog}
    </AppShell>
  );
};
