import type { IconName } from "@app/components/v4/ui/icon";
import { ProjectType } from "@app/hooks/api/projects/types";

export type ShellLevel =
  | "org"
  | "settings"
  | "product"
  | "project"
  | "pki"
  | "kms"
  | "scanning"
  | "pam"
  | "agent-vault";

export type ShellNavItem = {
  id: string;
  label: string;
  icon: IconName;
  path: string;
  search?: Record<string, string>;
  count?: number;
  drillIn?: boolean;
};

export type ShellNavSection = { label?: string; items: readonly ShellNavItem[] };

export const products = [
  {
    type: ProjectType.SecretManager,
    slug: "secret-management",
    keywords: ["sm", "secrets", "secret manager"],
    label: "Secrets Management",
    icon: "key",
    blurb: "Store, sync, and rotate secrets across environments."
  },
  {
    type: ProjectType.CertificateManager,
    slug: "cert-manager",
    keywords: ["cert", "certs", "certificates", "pki", "tls"],
    label: "Certificate Manager",
    icon: "cert",
    blurb: "Issue and renew certificates for TLS and code signing."
  },
  {
    type: ProjectType.KMS,
    slug: "kms",
    keywords: ["key management", "keys", "encryption"],
    label: "KMS",
    icon: "lock",
    blurb: "Manage keys to encrypt, decrypt, and sign data."
  },
  {
    type: ProjectType.SecretScanning,
    slug: "secret-scanning",
    keywords: ["scanning", "leaks", "findings"],
    label: "Secret Scanning",
    icon: "search",
    blurb: "Find leaked secrets in repositories and other sources."
  },
  {
    type: ProjectType.PAM,
    slug: "pam",
    keywords: ["pam", "privileged access"],
    label: "Privileged Access Manager",
    icon: "terminal",
    blurb: "Broker and record access to databases and servers."
  },
  {
    type: ProjectType.AgentVault,
    slug: "agent-vault",
    keywords: ["ai", "agents"],
    label: "Agent Vault",
    icon: "agent",
    blurb: "Give AI agents scoped access to secrets and services."
  }
] as const satisfies readonly {
  type: ProjectType;
  slug: string;
  label: string;
  icon: IconName;
  blurb: string;
  keywords: readonly string[];
}[];

export type ShellProduct = (typeof products)[number];

export const productOf = (type: ProjectType) =>
  products.find((product) => product.type === type) ?? products[0];

export const productHome = (product: ShellProduct) => {
  if (product.type === ProjectType.CertificateManager) return "/cert-manager/overview";
  if (product.type === ProjectType.SecretScanning) return "/secret-scanning/data-sources";
  if (product.type === ProjectType.PAM) return "/pam/accounts";
  return `/projects/${product.slug}`;
};

export const projectBase = (type: ProjectType, projectId: string) =>
  `/projects/${productOf(type).slug}/${projectId}`;

export const projectHome = (type: ProjectType, projectId: string) =>
  `${projectBase(type, projectId)}/${type === ProjectType.AgentVault ? "sessions" : "overview"}`;

const access = (path: string): ShellNavItem => ({
  id: "access",
  label: "Access control",
  icon: "user",
  path: `${path}/access-management`
});
const audit = (path: string): ShellNavItem => ({
  id: "audit",
  label: "Audit logs",
  icon: "history",
  path: `${path}/audit-logs`
});
const settings = (path: string): ShellNavItem => ({
  id: "settings",
  label: "Settings",
  icon: "settings",
  path: `${path}/settings`
});

export const orgSections = (isSubOrganization: boolean): readonly ShellNavSection[] => [
  {
    items: [
      { id: "home", label: "Home", icon: "home", path: "/projects" },
      { id: "integrations", label: "Integrations", icon: "apps", path: "/integrations" }
    ]
  },
  {
    label: "Administration",
    items: [
      access(""),
      ...(isSubOrganization
        ? []
        : [{ id: "billing", label: "Usage & billing", icon: "file" as const, path: "/billing" }]),
      audit(""),
      { ...settings(""), drillIn: true, search: { selectedTab: "tab-org-general" } }
    ]
  }
];

const settingsTab = (id: string, label: string, icon: IconName, selectedTab: string) => ({
  id,
  label,
  icon,
  path: "/settings",
  search: { selectedTab }
});

export const settingsSections = (isSubOrganization: boolean): readonly ShellNavSection[] => [
  {
    items: [
      settingsTab("general", "General", "settings", "tab-org-general"),
      ...(isSubOrganization
        ? []
        : [
            { id: "sso", label: "SSO & provisioning", icon: "lock" as const, path: "/sso" },
            {
              id: "oauth",
              label: "OAuth applications",
              icon: "apps" as const,
              path: "/oauth-applications"
            }
          ]),
      { id: "networking", label: "Networking", icon: "globe", path: "/networking" },
      ...(isSubOrganization
        ? []
        : [settingsTab("security", "Security", "cert", "tab-org-security")]),
      settingsTab("encryption", "Encryption", "key", "tab-org-encryption"),
      settingsTab("product", "Product settings", "settings", "product-settings"),
      ...(isSubOrganization
        ? []
        : [settingsTab("sub-orgs", "Sub organizations", "building", "tab-sub-organizations")])
    ]
  }
];

export const productSections = (product: ShellProduct): readonly ShellNavSection[] => {
  const base = `/projects/${product.slug}`;
  const items: ShellNavItem[] = [
    { id: "projects", label: "Projects", icon: "folder", path: base, drillIn: true }
  ];
  if (product.type === ProjectType.SecretManager) {
    items.push(
      { id: "product-insights", label: "Insights", icon: "globe", path: `${base}/insights` },
      {
        id: "product-settings",
        label: "Product settings",
        icon: "settings",
        path: `${base}/product-settings`
      }
    );
  } else if (product.type === ProjectType.KMS) {
    items.push(
      {
        id: "kmip-servers",
        label: "KMIP servers",
        icon: "machine",
        path: `${base}/kmip-servers`
      },
      {
        id: "product-settings",
        label: "Product settings",
        icon: "settings",
        path: `/projects/product-settings/${product.slug}`
      }
    );
  }
  return [{ items }];
};

export const projectSections = (base: string): readonly ShellNavSection[] => [
  {
    items: [
      { id: "secrets", label: "Secrets", icon: "key", path: `${base}/overview` },
      access(base),
      { id: "integrations", label: "Integrations", icon: "apps", path: `${base}/integrations` },
      { id: "insights", label: "Insights", icon: "globe", path: `${base}/insights` },
      { id: "approvals", label: "Approvals", icon: "inbox", path: `${base}/approval` }
    ]
  },
  { label: "Administration", items: [audit(base), settings(base)] }
];

export const kmsSections = (base: string): readonly ShellNavSection[] => [
  {
    items: [
      { id: "keys", label: "Keys", icon: "key", path: `${base}/overview` },
      { id: "kmip", label: "KMIP", icon: "machine", path: `${base}/kmip` }
    ]
  },
  { label: "Administration", items: [access(base), audit(base), settings(base)] }
];

const pki = "/cert-manager";
export const pkiSections: readonly ShellNavSection[] = [
  {
    items: [
      { id: "dashboard", label: "Dashboard", icon: "home", path: `${pki}/overview` },
      { id: "inventory", label: "Inventory", icon: "cert", path: `${pki}/inventory` },
      { id: "discovery", label: "Discovery", icon: "search", path: `${pki}/discovery` },
      { id: "requests", label: "Approval requests", icon: "inbox", path: `${pki}/requests` }
    ]
  },
  {
    label: "Resources",
    items: [
      { id: "applications", label: "Applications", icon: "apps", path: `${pki}/applications` },
      { id: "signers", label: "Signers", icon: "file", path: `${pki}/code-signing` },
      {
        id: "authorities",
        label: "Certificate authorities",
        icon: "building",
        path: `${pki}/certificate-authorities`
      },
      {
        id: "policies",
        label: "Certificate policies",
        icon: "check-c",
        path: `${pki}/certificate-policies`
      },
      {
        id: "profiles",
        label: "Certificate profiles",
        icon: "folder",
        path: `${pki}/certificate-profiles`
      }
    ]
  },
  { label: "Administration", items: [access(pki), audit(pki), settings(pki)] }
];

const scanning = "/secret-scanning";
export const scanningSections: readonly ShellNavSection[] = [
  {
    items: [
      { id: "data-sources", label: "Data sources", icon: "git", path: `${scanning}/data-sources` },
      { id: "findings", label: "Findings", icon: "alert", path: `${scanning}/findings` },
      {
        id: "app-connections",
        label: "App connections",
        icon: "link",
        path: `${scanning}/app-connections`
      }
    ]
  },
  { label: "Administration", items: [access(scanning), audit(scanning), settings(scanning)] }
];

const pam = "/pam";
export const pamSections: readonly ShellNavSection[] = [
  { items: [{ id: "accounts", label: "Accounts", icon: "folder-open", path: `${pam}/accounts` }] },
  {
    label: "Manage",
    items: [
      { id: "templates", label: "Account templates", icon: "file", path: `${pam}/templates` },
      { id: "discovery", label: "Discovery", icon: "search", path: `${pam}/discovery` }
    ]
  },
  {
    label: "Monitor",
    items: [
      { id: "sessions", label: "Sessions", icon: "monitor", path: `${pam}/sessions` },
      {
        id: "approval-requests",
        label: "Approval requests",
        icon: "inbox",
        path: `${pam}/approval-requests`
      },
      audit(pam)
    ]
  },
  { label: "Configure", items: [access(pam)] }
];

export const agentVaultSections = (base: string): readonly ShellNavSection[] => [
  {
    items: [
      { id: "sessions", label: "Sessions", icon: "user", path: `${base}/sessions` },
      {
        id: "access-bundles",
        label: "Access bundles",
        icon: "folder",
        path: `${base}/access-bundles`
      },
      { id: "variables", label: "Variables", icon: "key", path: `${base}/variables` },
      { id: "skills", label: "Skills", icon: "file", path: `${base}/skills` }
    ]
  },
  {
    label: "Infrastructure",
    items: [{ id: "proxies", label: "Proxies", icon: "machine", path: `${base}/proxies` }]
  },
  { label: "Administration", items: [access(base), audit(base), settings(base)] }
];
