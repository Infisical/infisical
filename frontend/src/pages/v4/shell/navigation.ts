import type { IconName } from "@infisical/cipher/ui/icon";

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

export type ShellNavSection = {
  label?: string;
  items: readonly ShellNavItem[];
};

export type ShellProductNavItem = {
  id: string;
  label: string;
  icon: IconName;
  path: string;
  children?: readonly ShellNavItem[];
};

export const SECRETS_HUE = 113.8;
export const ORG_HUE = 250;

export const products = [
  {
    type: ProjectType.SecretManager,
    slug: "secret-management",
    keywords: ["sm", "secrets", "secret manager"],
    label: "Secrets Management",
    icon: "key",
    folder: "folder-secrets",
    blurb: "Store, sync, and rotate secrets across environments.",
    hue: SECRETS_HUE
  },
  {
    type: ProjectType.CertificateManager,
    slug: "cert-manager",
    keywords: ["cert", "certs", "certificates", "pki", "tls"],
    label: "Certificate Manager",
    icon: "cert",
    folder: "folder-cert",
    blurb: "Issue and renew certificates for TLS and code signing.",
    hue: 56
  },
  {
    type: ProjectType.KMS,
    slug: "kms",
    keywords: ["key management", "keys", "encryption"],
    label: "KMS",
    icon: "keyhole",
    folder: "folder-kms",
    blurb: "Manage keys to encrypt, decrypt, and sign data.",
    hue: 172
  },
  {
    type: ProjectType.SecretScanning,
    slug: "secret-scanning",
    keywords: ["scanning", "leaks", "findings"],
    label: "Secret Scanning",
    icon: "scan-key",
    folder: "folder-scanning",
    blurb: "Find leaked secrets in repositories and other sources.",
    hue: 305
  },
  {
    type: ProjectType.PAM,
    slug: "pam",
    keywords: ["pam", "privileged access"],
    label: "Privileged Access Manager",
    icon: "terminal-key",
    folder: "folder-pam",
    blurb: "Broker and record access to databases and servers.",
    hue: 18
  },
  {
    type: ProjectType.AgentVault,
    slug: "agent-vault",
    keywords: ["ai", "agents"],
    label: "Agent Vault",
    icon: "agent-lock",
    folder: "folder-agent",
    blurb: "Give AI agents scoped access to secrets and services.",
    hue: 152
  }
] as const satisfies readonly {
  type: ProjectType;
  slug: string;
  label: string;
  icon: IconName;
  folder: IconName;
  blurb: string;
  hue: number;
  keywords: readonly string[];
}[];

export type ShellProduct = (typeof products)[number];

export const productOf = (type: ProjectType) =>
  products.find((product) => product.type === type) ?? products[0];

export const hueOf = (product: ShellProduct | undefined) =>
  product
    ? { hue: product.hue, level: "pop" as const }
    : { hue: ORG_HUE, level: "subtle" as const };

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
  icon: "shield-user",
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
      {
        id: "integrations",
        label: "Integrations",
        icon: "apps",
        path: "/integrations"
      }
    ]
  },
  {
    label: "Administration",
    items: [
      access(""),
      ...(isSubOrganization
        ? []
        : [
            {
              id: "billing",
              label: "Usage & billing",
              icon: "credit-card" as const,
              path: "/billing"
            }
          ]),
      audit(""),
      {
        ...settings(""),
        drillIn: true,
        search: { selectedTab: "tab-org-general" }
      }
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
            {
              id: "sso",
              label: "SSO & provisioning",
              icon: "sign-in" as const,
              path: "/sso"
            },
            {
              id: "oauth",
              label: "OAuth applications",
              icon: "app-window" as const,
              path: "/oauth-applications"
            }
          ]),
      {
        id: "networking",
        label: "Networking",
        icon: "network",
        path: "/networking"
      },
      ...(isSubOrganization
        ? []
        : [settingsTab("security", "Security", "shield-check", "tab-org-security")]),
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
    {
      id: "projects",
      label: "Projects",
      icon: product.folder,
      path: base,
      drillIn: true
    }
  ];
  if (product.type === ProjectType.SecretManager) {
    items.push(
      {
        id: "product-insights",
        label: "Insights",
        icon: "chart-column",
        path: `${base}/insights`
      },
      {
        id: "secret-sharing",
        label: "Secret sharing",
        icon: "send",
        path: `${base}/secret-sharing`
      },
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
        icon: "server",
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

const productNavLabel = (product: ShellProduct) =>
  product.type === ProjectType.PAM ? "Privileged Access" : product.label;

/** The org sidebar's Products section. A product with product-level pages expands in place to them; the rest link to their home. */
export const productNavItems = (blocked: ReadonlySet<ProjectType>): ShellProductNavItem[] =>
  products
    .filter((product) => !blocked.has(product.type))
    .map((product) => {
      const pages = productSections(product)[0].items;
      return {
        id: product.slug,
        label: productNavLabel(product),
        icon: product.icon,
        path: productHome(product),
        children: pages.length > 1 ? pages : undefined
      };
    });

const settingsTabOf =
  (path: string) => (id: string, label: string, icon: IconName, selectedTab: string) => ({
    ...settingsTab(id, label, icon, selectedTab),
    path
  });

export const projectSettingsSections = (
  level: ShellLevel,
  base: string
): readonly ShellNavSection[] | undefined => {
  const tab = settingsTabOf(base);
  if (level === "project")
    return [
      {
        items: [
          tab("general", "General", "settings", "tab-project-general"),
          tab("environments", "Environments", "layers", "tab-secret-environments"),
          tab("tags", "Tags", "tag", "tab-secret-tags"),
          tab("policies", "Policies", "shield-check", "tab-secret-policies"),
          tab("encryption", "Encryption", "lock", "tab-project-encryption"),
          tab("workflow", "Workflow integrations", "apps", "tab-workflow-integrations"),
          tab("webhooks", "Webhooks", "webhook", "tab-project-webhooks")
        ]
      }
    ];
  if (level === "agent-vault")
    return [
      {
        items: [
          tab("general", "General", "settings", "tab-project-general"),
          tab("session-logs", "Session logs", "history", "tab-session-logs")
        ]
      }
    ];
  if (level === "pki")
    return [
      {
        items: [
          tab("app-connections", "App connections", "cable", "app-connections"),
          tab("hsm-connectors", "HSM connectors", "server", "hsm-connectors"),
          tab("cleanup", "Cleanup", "trash", "cleanup"),
          tab("alerts", "Alerts", "bell", "alerts")
        ]
      }
    ];
  return undefined;
};

export const projectSections = (base: string): readonly ShellNavSection[] => [
  {
    items: [
      {
        id: "secrets",
        label: "Secrets",
        icon: "key",
        path: `${base}/overview`
      },
      access(base),
      {
        id: "integrations",
        label: "Integrations",
        icon: "apps",
        path: `${base}/integrations`
      },
      {
        id: "insights",
        label: "Insights",
        icon: "chart-column",
        path: `${base}/insights`
      },
      {
        id: "approvals",
        label: "Approvals",
        icon: "inbox",
        path: `${base}/approval`
      }
    ]
  },
  { label: "Administration", items: [audit(base), settings(base)] }
];

export const kmsSections = (base: string): readonly ShellNavSection[] => [
  {
    items: [
      { id: "keys", label: "Keys", icon: "key", path: `${base}/overview` },
      { id: "kmip", label: "KMIP", icon: "server", path: `${base}/kmip` }
    ]
  },
  {
    label: "Administration",
    items: [access(base), audit(base), settings(base)]
  }
];

const pki = "/cert-manager";
export const pkiSections: readonly ShellNavSection[] = [
  {
    items: [
      {
        id: "dashboard",
        label: "Dashboard",
        icon: "chart-column",
        path: `${pki}/overview`
      },
      {
        id: "inventory",
        label: "Inventory",
        icon: "cert",
        path: `${pki}/inventory`
      },
      {
        id: "discovery",
        label: "Discovery",
        icon: "radar",
        path: `${pki}/discovery`
      },
      {
        id: "requests",
        label: "Requests",
        icon: "inbox",
        path: `${pki}/requests`
      }
    ]
  },
  {
    label: "Resources",
    items: [
      {
        id: "applications",
        label: "Applications",
        icon: "app-window",
        path: `${pki}/applications`
      },
      {
        id: "syncs",
        label: "Certificate syncs",
        icon: "sync",
        path: `${pki}/integrations`
      },
      {
        id: "signers",
        label: "Signers",
        icon: "pen-nib",
        path: `${pki}/code-signing`
      },
      {
        id: "authorities",
        label: "Certificate authorities",
        icon: "landmark",
        path: `${pki}/certificate-authorities`
      },
      {
        id: "policies",
        label: "Certificate policies",
        icon: "shield-check",
        path: `${pki}/certificate-policies`
      },
      {
        id: "profiles",
        label: "Certificate profiles",
        icon: "file-badge",
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
      {
        id: "data-sources",
        label: "Data sources",
        icon: "git",
        path: `${scanning}/data-sources`
      },
      {
        id: "findings",
        label: "Findings",
        icon: "alert",
        path: `${scanning}/findings`
      },
      {
        id: "app-connections",
        label: "App connections",
        icon: "cable",
        path: `${scanning}/app-connections`
      }
    ]
  },
  {
    label: "Administration",
    items: [access(scanning), audit(scanning), settings(scanning)]
  }
];

const pam = "/pam";
export const pamSections: readonly ShellNavSection[] = [
  {
    items: [
      {
        id: "accounts",
        label: "Accounts",
        icon: "user-key",
        path: `${pam}/accounts`
      }
    ]
  },
  {
    label: "Manage",
    items: [
      {
        id: "templates",
        label: "Account templates",
        icon: "clipboard-list",
        path: `${pam}/templates`
      },
      {
        id: "discovery",
        label: "Discovery",
        icon: "radar",
        path: `${pam}/discovery`
      }
    ]
  },
  {
    label: "Monitor",
    items: [
      {
        id: "sessions",
        label: "Sessions",
        icon: "monitor",
        path: `${pam}/sessions`
      },
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
      {
        id: "sessions",
        label: "Sessions",
        icon: "id-card",
        path: `${base}/sessions`
      },
      {
        id: "access-bundles",
        label: "Access bundles",
        icon: "package",
        path: `${base}/access-bundles`
      },
      {
        id: "services",
        label: "Services",
        icon: "proxy",
        path: `${base}/services`
      },
      {
        id: "variables",
        label: "Variables",
        icon: "braces",
        path: `${base}/variables`
      },
      { id: "skills", label: "Skills", icon: "book", path: `${base}/skills` }
    ]
  },
  {
    label: "Infrastructure",
    items: [
      {
        id: "proxies",
        label: "Proxies",
        icon: "server",
        path: `${base}/proxies`
      }
    ]
  },
  {
    label: "Administration",
    items: [access(base), audit(base), settings(base)]
  }
];
