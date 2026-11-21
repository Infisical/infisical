import { type MouseEvent, type ReactNode, useState } from "react";
import { hueScope } from "@infisical/cipher/lib/hue";
import { HuePortal } from "@infisical/cipher/scope";
import type { BreadcrumbCrumb } from "@infisical/cipher/ui/breadcrumb";
import { Button } from "@infisical/cipher/ui/button";
import { Icon } from "@infisical/cipher/ui/icon";
import { Loader } from "@infisical/cipher/ui/loader";
import { Popover, PopoverAnchor } from "@infisical/cipher/ui/popover";
import { Sidebar } from "@infisical/cipher/ui/sidebar";
import { AppInset, AppShell, PageGutter, TopBar } from "@infisical/cipher/ui/top-bar";
import {
  type LinkOptions,
  useMatches,
  useNavigate,
  useParams,
  useRouterState
} from "@tanstack/react-router";

import { keepInClassic, toV3Href } from "@app/helpers/v4Bridge";
import { ProjectType } from "@app/hooks/api/projects/types";

import { useAgentVaultSetupSidebar } from "../agent-vault/setup-checklist/SetupChecklist";
import { useV4Session } from "../data/session/contract";
import { orgHref } from "../links";
import { V4_DEMO_ORG_ID } from "../mode";
import { useResolveV4Href } from "../resolveV4Href";
import { usePendingApprovals } from "../secret-manager/pending-approvals";
import { type ShellBannerContext, type ShellBannerScope, PageFrame, ShellBanners } from "./banners";
import { useShellChrome } from "./chrome";
import { CommandPalette } from "./command-palette";
import { useCornerCard } from "./corner";
import { productCurrentId, shellTrail, type V4ShellLevel } from "./levels";
import { resolveShellLocation, type ShellLocation } from "./location";
import {
  hueOf,
  orgSections,
  products,
  productHome,
  productOf,
  projectBase,
  projectHome
} from "./navigation";
import { NotificationInbox, useNotificationInbox } from "./notifications";
import { useBlockedProducts } from "./product-access";
import { ProjectGate } from "./project-gate";
import { nameLabel, useProjectName } from "./resource-name";

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

const OpenInClassic = ({ href }: { href: string }) => {
  const navigate = useNavigate();
  return (
    <Button variant="link" underline="hover" asChild>
      <a
        href={href}
        data-open-classic
        onClick={(event) => {
          keepInClassic(href);
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
          event.preventDefault();
          navigate({ href });
        }}
      >
        Open in classic
      </a>
    </Button>
  );
};

const topBarActions = (versionBadge: ReactNode, classicHref?: string) =>
  (versionBadge || classicHref) && (
    <>
      {versionBadge}
      {classicHref && <OpenInClassic href={classicHref} />}
    </>
  );

const bannerContext = ({
  at,
  base,
  pathname,
  nav,
  banners
}: {
  at: ShellLocation;
  base: string;
  pathname: string;
  nav?: V4ShellNav;
  banners?: ShellBannerScope;
}): Omit<ShellBannerContext, "orgId"> => {
  if (nav) return { scope: banners ?? "org" };
  const product = at.product ? productOf(at.product) : undefined;
  const insideProject =
    Boolean(at.projectId) ||
    at.product === ProjectType.CertificateManager ||
    at.product === ProjectType.SecretScanning;
  let home = "";
  if (product && at.projectId) home = `${base}${projectHome(product.type, at.projectId)}`;
  else if (product) home = `${base}${productHome(product)}`;
  return {
    scope: insideProject ? "project" : "org",
    product: at.product,
    projectId: at.projectId,
    home,
    certManagerOverview: pathname.slice(base.length) === "/cert-manager/overview"
  };
};

const sidebarCurrentId = ({
  nav,
  at,
  shownId,
  sidebarCurrent
}: {
  nav?: V4ShellNav;
  at: ShellLocation;
  shownId: string;
  sidebarCurrent?: { id: string };
}) => {
  if (nav) return nav.current;
  if (at.level === "product" && at.product && at.current)
    return productCurrentId(at.product, at.current.id);
  return sidebarCurrent && `${shownId}:${sidebarCurrent.id}`;
};

export type V4ShellNav = {
  levels?: readonly V4ShellLevel[];
  current?: string;
  crumbs: readonly BreadcrumbCrumb[];
};

export const V4Shell = ({
  children,
  nav,
  banners
}: {
  children: ReactNode;
  nav?: V4ShellNav;
  banners?: Extract<ShellBannerScope, "admin" | "personal">;
}) => {
  const session = useV4Session();
  const { orgId = session.organization.id } = useParams({ strict: false });
  const location = useRouterState({ select: (state) => state.location });
  const navigate = useNavigate();
  const chrome = useShellChrome();
  const resolve = useResolveV4Href();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const inbox = useNotificationInbox(orgId);
  const readiness = useMatches({
    select: (matches) => matches.at(-1)?.staticData.readiness
  });
  const toClassic = useMatches({
    select: (matches) => matches.at(-1)?.staticData.classicHref
  });
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
  const at: ShellLocation = nav
    ? {
        level: "org",
        sections: orgSections(session.organization.isSubOrganization)
      }
    : resolveShellLocation(
        location.pathname.slice(base.length),
        selectedTab,
        session.organization.isSubOrganization
      );
  const go = (href: string) => navigate({ href: resolve(href) });
  const product = at.product ? productOf(at.product) : undefined;
  const hue = hueOf(product);
  const sidebarCurrent = at.current ?? (at.projectId ? at.sections[0]?.items[0] : undefined);
  const projectName = useProjectName(at.projectId ?? "");
  const agentVaultSetup = useAgentVaultSetupSidebar(orgId, at);
  const blocked = useBlockedProducts(orgId);
  const approvals = usePendingApprovals(
    at.product === ProjectType.SecretManager ? (at.projectId ?? "") : ""
  );
  const trail = shellTrail({
    at,
    projectName: projectName.name,
    isSubOrganization: session.organization.isSubOrganization,
    blocked,
    nested: nav?.levels,
    linkTo: (path, search) => ({ to: resolve(`${base}${path}`), search }) as LinkOptions,
    projectCounts: { approvals: approvals.changesToReview + approvals.accessToReview }
  });
  const shown = trail[trail.length - 1];
  const parent = trail[trail.length - 2];
  const corner = useCornerCard(orgId, shown.id === "org", chrome.whatsNew);
  const current = sidebarCurrentId({ nav, at, shownId: shown.id, sidebarCurrent });

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
          label: nameLabel(projectName, "project"),
          media: <Icon name={product.folder} />,
          href: resolve(`${base}${projectHome(product.type, at.projectId)}`),
          switcher: {
            label: "Switch project",
            options: session.projects
              .filter((entry) => entry.type === product.type)
              .map((entry) => ({
                value: entry.id,
                label: entry.name,
                media: <Icon name={product.folder} />
              })),
            value: at.projectId,
            onChange: (id: string) => {
              const from = `${base}${projectBase(product.type, at.projectId!)}`;
              go(location.pathname.replace(from, `${base}${projectBase(product.type, id)}`));
            }
          }
        }
      : undefined;
  const breadcrumb = nav
    ? [orgCrumb, ...nav.crumbs]
    : [
        orgCrumb,
        ...(at.level === "settings"
          ? [{ label: "Settings", href: resolve(`${base}/settings`) }]
          : []),
        ...(productCrumb ? [productCrumb] : []),
        ...(projectCrumb ? [projectCrumb] : []),
        ...(at.inSettings ? [{ label: "Settings", href: resolve(location.pathname) }] : []),
        ...(at.current ? [{ label: at.current.label }] : [])
      ];

  const classicHref =
    orgId !== V4_DEMO_ORG_ID && readiness === "partial"
      ? (toClassic ?? String)(toV3Href(location.href))
      : undefined;
  let content = children;
  if (switching) content = <Loader size="page" label="Loading organization" />;
  else if (at.projectId)
    content = (
      <ProjectGate key={at.projectId} projectId={at.projectId}>
        {children}
      </ProjectGate>
    );

  return (
    <div className={styles.frame}>
      <PageFrame scope={banners} />
      <AppShell className={styles.app} onClickCapture={(event) => routeInternalLinks(event, go)}>
        <Popover open={inbox.open} onOpenChange={inbox.onOpenChange}>
          <PopoverAnchor asChild>
            <TopBar
              breadcrumb={breadcrumb}
              notifications={{ unread: inbox.unread, onClick: inbox.toggle }}
              actions={topBarActions(chrome.versionBadge, classicHref)}
              search={{ onClick: () => setPaletteOpen(true), label: "Search" }}
              account={chrome.account}
            />
          </PopoverAnchor>
          <NotificationInbox orgId={orgId} inbox={inbox} />
        </Popover>
        <Sidebar
          label="Main"
          sections={shown.sections}
          scope={
            parent && {
              id: shown.id,
              back: {
                id: parent.id,
                label: parent.label,
                link: parent.landing
              },
              sections: shown.sections
            }
          }
          current={current}
          help={chrome.help}
          announcements={chrome.announcements}
          {...corner}
          {...agentVaultSetup}
        />
        <HuePortal {...hue}>
          <AppInset {...hueScope(hue.hue, hue.level)}>
            <ShellBanners
              orgId={orgId}
              {...bannerContext({
                at,
                base,
                pathname: location.pathname,
                nav,
                banners
              })}
            />
            <PageGutter className={styles.content}>{content}</PageGutter>
          </AppInset>
        </HuePortal>
        {chrome.dialog}
        <CommandPalette
          orgId={orgId}
          projectId={at.projectId}
          open={paletteOpen}
          onOpenChange={setPaletteOpen}
        />
      </AppShell>
      <PageFrame scope={banners} />
    </div>
  );
};
