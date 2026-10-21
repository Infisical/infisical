import { type ReactNode, useState } from "react";

import { type BreadcrumbCrumb } from "@app/components/v4/ui/breadcrumb";
import { Button } from "@app/components/v4/ui/button";
import { Sidebar, type SidebarProps } from "@app/components/v4/ui/sidebar";
import { Tooltip, TooltipProvider } from "@app/components/v4/ui/tooltip";
import { AppInset, AppShell, PageGutter, TopBar } from "@app/components/v4/ui/top-bar";

export const user = { name: "Sarah Lin", email: "sarah@acme.dev" };
export const orgSections: SidebarProps["sections"] = [
  {
    label: "General",
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
      { id: "settings", label: "Settings", icon: "settings" }
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
export const settingsSections: SidebarProps["sections"] = [
  {
    label: "Settings",
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
  { value: "kms", label: "KMS" }
];
const projects = [
  { value: "payments-api", label: "payments-api", mono: true },
  { value: "web-dashboard", label: "web-dashboard", mono: true },
  { value: "platform-core", label: "platform-core", mono: true }
];
const labelOf = (options: { value: string; label: string }[], value: string) =>
  options.find((option) => option.value === value)?.label ?? value;

export const useCrumbs = () => {
  const [org, setOrg] = useState("acme");
  const [product, setProduct] = useState("secrets");
  const [project, setProject] = useState("payments-api");
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

export const Shell = ({
  sections,
  current,
  crumbs,
  children
}: {
  sections: SidebarProps["sections"];
  current: string;
  crumbs: readonly BreadcrumbCrumb[];
  children?: ReactNode;
}) => {
  const [page, setPage] = useState(current);
  return (
    <AppShell style={{ height: "100%" }}>
      <Sidebar
        label="Main"
        sections={sections}
        current={page}
        onNavigate={(item) => setPage(item.id)}
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
