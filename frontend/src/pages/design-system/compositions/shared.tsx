import { type ReactNode, useState } from "react";

import { type BreadcrumbCrumb } from "@app/components/v4/ui/breadcrumb";
import { Button } from "@app/components/v4/ui/button";
import { Sidebar, type SidebarProps } from "@app/components/v4/ui/sidebar";
import { Tooltip, TooltipProvider } from "@app/components/v4/ui/tooltip";
import { AppInset, AppShell, PageGutter, TopBar } from "@app/components/v4/ui/top-bar";

export const user = { name: "Sarah Lin", email: "sarah@acme.dev" };
export const orgSections: SidebarProps["sections"] = [
  {
    items: [
      { id: "home", label: "Home", icon: "home" },
      { id: "integrations", label: "Integrations", icon: "apps" }
    ]
  },
  {
    label: "Administration",
    items: [
      { id: "access", label: "Access control", icon: "user" },
      { id: "billing", label: "Usage & billing", icon: "file" },
      { id: "audit", label: "Audit logs", icon: "history" },
      { id: "settings", label: "Settings", icon: "settings", drillIn: true }
    ]
  }
];
export const projectSections: SidebarProps["sections"] = [
  {
    items: [
      { id: "secrets", label: "Secrets", icon: "key" },
      { id: "access", label: "Access control", icon: "user" },
      { id: "integrations", label: "Integrations", icon: "apps" },
      { id: "insights", label: "Insights", icon: "globe" },
      { id: "approvals", label: "Approvals", icon: "inbox", count: 4 }
    ]
  },
  {
    label: "Administration",
    items: [
      { id: "audit", label: "Audit logs", icon: "history" },
      { id: "settings", label: "Settings", icon: "settings" }
    ]
  }
];
export const productSections: SidebarProps["sections"] = [
  {
    items: [
      { id: "projects", label: "Projects", icon: "folder", drillIn: true },
      { id: "product-insights", label: "Insights", icon: "globe" },
      { id: "product-settings", label: "Product settings", icon: "settings" }
    ]
  }
];
export const pkiSections: SidebarProps["sections"] = [
  {
    items: [
      { id: "dashboard", label: "Dashboard", icon: "home" },
      { id: "inventory", label: "Inventory", icon: "cert" },
      { id: "discovery", label: "Discovery", icon: "search" },
      { id: "requests", label: "Approval requests", icon: "inbox", count: 2 }
    ]
  },
  {
    label: "Resources",
    items: [
      { id: "applications", label: "Applications", icon: "apps" },
      { id: "signers", label: "Signers", icon: "file" },
      { id: "authorities", label: "Certificate authorities", icon: "building" },
      { id: "policies", label: "Certificate policies", icon: "check-c" },
      { id: "profiles", label: "Certificate profiles", icon: "folder" }
    ]
  },
  {
    label: "Administration",
    items: [
      { id: "access", label: "Access control", icon: "user" },
      { id: "audit", label: "Audit logs", icon: "history" },
      { id: "settings", label: "Settings", icon: "settings" }
    ]
  }
];
export const kmsSections: SidebarProps["sections"] = [
  {
    items: [
      { id: "keys", label: "Keys", icon: "key" },
      { id: "kmip", label: "KMIP", icon: "machine" }
    ]
  },
  {
    label: "Administration",
    items: [
      { id: "access", label: "Access control", icon: "user" },
      { id: "audit", label: "Audit logs", icon: "history" },
      { id: "settings", label: "Settings", icon: "settings" }
    ]
  }
];
export const scanningSections: SidebarProps["sections"] = [
  {
    items: [
      { id: "data-sources", label: "Data sources", icon: "git" },
      { id: "findings", label: "Findings", icon: "alert", count: 14 },
      { id: "app-connections", label: "App connections", icon: "link" }
    ]
  },
  {
    label: "Administration",
    items: [
      { id: "scanning-access", label: "Access control", icon: "user" },
      { id: "scanning-audit", label: "Audit logs", icon: "history" },
      { id: "scanning-settings", label: "Settings", icon: "settings" }
    ]
  }
];
export const settingsSections: SidebarProps["sections"] = [
  {
    items: [
      { id: "general", label: "General", icon: "settings" },
      { id: "sso", label: "SSO & provisioning", icon: "lock" },
      { id: "oauth", label: "OAuth applications", icon: "apps" },
      { id: "networking", label: "Networking", icon: "globe" },
      { id: "security", label: "Security", icon: "cert" },
      { id: "encryption", label: "Encryption", icon: "key" },
      { id: "product", label: "Product settings", icon: "settings" },
      { id: "sub-orgs", label: "Sub organizations", icon: "building" }
    ]
  }
];

const organizations = [
  { value: "acme", label: "Acme Corp", meta: "Enterprise" },
  { value: "acme-eu", label: "Acme EU", meta: "Pro" }
];
const products = [
  { value: "secrets", label: "Secrets Management" },
  { value: "certs", label: "Certificate Manager" },
  { value: "kms", label: "KMS" },
  { value: "scanning", label: "Secret Scanning" }
];
const projects = [
  { value: "payments-api", label: "payments-api", mono: true },
  { value: "web-dashboard", label: "web-dashboard", mono: true },
  { value: "platform-core", label: "platform-core", mono: true },
  { value: "internal-pki", label: "internal-pki", mono: true },
  { value: "kms-keys", label: "kms-keys", mono: true }
];
const labelOf = (options: { value: string; label: string }[], value: string) =>
  options.find((option) => option.value === value)?.label ?? value;

export const useCrumbs = (initial: { product?: string; project?: string } = {}) => {
  const [org, setOrg] = useState("acme");
  const [product, setProduct] = useState(initial.product ?? "secrets");
  const [project, setProject] = useState(initial.project ?? "payments-api");
  return {
    org: {
      label: labelOf(organizations, org),
      menu: { label: "Switch organization", options: organizations, value: org, onChange: setOrg }
    } satisfies BreadcrumbCrumb,
    product: {
      label: labelOf(products, product),
      menu: { label: "Switch product", options: products, value: product, onChange: setProduct }
    } satisfies BreadcrumbCrumb,
    project: {
      label: labelOf(projects, project),
      mono: true,
      menu: { label: "Switch project", options: projects, value: project, onChange: setProject }
    } satisfies BreadcrumbCrumb
  };
};

const barActions = (
  <TooltipProvider>
    <Tooltip content="Search" shortcut="mod+K" side="bottom">
      <Button variant="ghost" size="icon" icon="search" iconOnly>
        Search
      </Button>
    </Tooltip>
    <Tooltip content="Notifications" side="bottom">
      <Button variant="ghost" size="icon" icon="bell" iconOnly>
        Notifications
      </Button>
    </Tooltip>
  </TooltipProvider>
);

export type ShellLevel = "org" | "settings" | "product" | "project" | "pki" | "kms" | "scanning";
const levelSections: Record<ShellLevel, SidebarProps["sections"]> = {
  org: orgSections,
  settings: settingsSections,
  product: productSections,
  project: projectSections,
  pki: pkiSections,
  kms: kmsSections,
  scanning: scanningSections
};
const projectHome: Record<string, { level: ShellLevel; page: string }> = {
  secrets: { level: "project", page: "secrets" },
  certs: { level: "pki", page: "inventory" },
  kms: { level: "kms", page: "keys" }
};
const parent: Record<Exclude<ShellLevel, "org">, { level: ShellLevel; page: string }> = {
  settings: { level: "org", page: "settings" },
  product: { level: "org", page: "home" },
  project: { level: "product", page: "projects" },
  pki: { level: "product", page: "projects" },
  kms: { level: "product", page: "projects" },
  scanning: { level: "org", page: "home" }
};
const projectLevels: readonly ShellLevel[] = ["project", "pki", "kms"];

export const Shell = ({
  level: initialLevel,
  current,
  crumbs: initialCrumbs,
  product: initialProduct,
  project: initialProject,
  onNavigate,
  children
}: {
  level: ShellLevel;
  current: string;
  crumbs: readonly BreadcrumbCrumb[];
  product?: string;
  project?: string;
  onNavigate?: (page: string) => void;
  children?: ReactNode;
}) => {
  const { org, product, project } = useCrumbs({ product: initialProduct, project: initialProject });
  const opens: Record<string, { level: ShellLevel; page: string }> = {
    settings: { level: "settings", page: "general" },
    projects: projectHome[initialProduct ?? "secrets"]
  };
  const [at, setAt] = useState({ level: initialLevel, page: current });
  const sections = levelSections[at.level];
  const pageLabel =
    sections?.flatMap((section) => section.items).find((item) => item.id === at.page)?.label ??
    at.page;
  const trail: Record<ShellLevel, readonly BreadcrumbCrumb[]> = {
    org: [org, { label: pageLabel }],
    settings: [org, { label: "Settings" }, { label: pageLabel }],
    product: [org, product, { label: pageLabel }],
    project: [org, product, project, { label: pageLabel }],
    pki: [org, product, project, { label: pageLabel }],
    kms: [org, product, project, { label: pageLabel }],
    scanning: [org, product, { label: pageLabel }]
  };
  const crumbs = at.level === initialLevel && at.page === current ? initialCrumbs : trail[at.level];
  const scope =
    at.level === "org"
      ? undefined
      : {
          id: at.level,
          back: {
            id: `back-${at.level}`,
            label: projectLevels.includes(at.level) ? product.label : org.label
          },
          sections: sections ?? []
        };
  return (
    <AppShell style={{ height: "100%" }}>
      <Sidebar
        label="Main"
        sections={sections}
        scope={scope}
        current={at.page}
        onNavigate={(item) => {
          if (item.id.startsWith("back-") && at.level !== "org") setAt(parent[at.level]);
          else setAt((item.drillIn && opens[item.id]) || { level: at.level, page: item.id });
          onNavigate?.(item.id);
        }}
        search={{ onClick: () => {} }}
        user={user}
        footerItems={[
          { id: "docs", label: "Docs", icon: "file", href: "#comparisons", external: true }
        ]}
      />
      <AppInset>
        <TopBar breadcrumb={crumbs} actions={barActions} />
        {children && <PageGutter>{children}</PageGutter>}
      </AppInset>
    </AppShell>
  );
};
