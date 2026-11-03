import { type ReactNode, useState } from "react";
import { BookOpen, Github, LogOut, Mail, MessagesSquare } from "lucide-react";

import { type Announcement, Announcements } from "@app/components/v4/ui/announcements";
import { type BreadcrumbCrumb } from "@app/components/v4/ui/breadcrumb";
import { Icon } from "@app/components/v4/ui/icon";
import { Pagination } from "@app/components/v4/ui/pagination";
import { Sidebar, type SidebarHelp, type SidebarProps } from "@app/components/v4/ui/sidebar";
import {
  AppInset,
  AppShell,
  PageGutter,
  type ShellTheme,
  TopBar,
  type TopBarAccount
} from "@app/components/v4/ui/top-bar";

import { useWorkbench } from "../workbench-context";

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

const rootOrg = "acme";
const organizations = [
  { value: "acme", label: "Acme Corp", group: "Current organization" },
  { value: "acme-eu", label: "acme-eu", group: "Sub-organizations" },
  { value: "acme-labs", label: "acme-labs", group: "Sub-organizations" },
  { value: "globex", label: "Globex", group: "Other organizations" },
  { value: "initech", label: "Initech", group: "Other organizations" }
];
const products = [
  { value: "secrets", label: "Secrets Management", icon: "key" },
  { value: "certs", label: "Certificate Manager", icon: "cert" },
  { value: "kms", label: "KMS", icon: "lock" },
  { value: "scanning", label: "Secret Scanning", icon: "search" },
  { value: "pam", label: "Privileged Access Manager", icon: "terminal" },
  { value: "agent-vault", label: "Agent Vault", icon: "agent" }
] as const;
const projects = [
  { value: "payments-api", label: "payments-api", mono: true },
  { value: "web-dashboard", label: "web-dashboard", mono: true },
  { value: "platform-core", label: "platform-core", mono: true },
  { value: "internal-pki", label: "internal-pki", mono: true },
  { value: "kms-keys", label: "kms-keys", mono: true }
];
const labelOf = (options: { value: string; label: string }[], value: string) =>
  options.find((option) => option.value === value)?.label ?? value;

export const usePagedRows = <Row,>(rows: readonly Row[], label: string, initialPageSize = 20) => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const current = Math.min(page, Math.max(1, Math.ceil(rows.length / pageSize)));
  return {
    pageRows: rows.slice((current - 1) * pageSize, current * pageSize),
    pagination: (
      <Pagination
        label={label}
        variant="compact"
        page={current}
        onPageChange={setPage}
        total={rows.length}
        pageSize={pageSize}
        pageSizeOptions={[10, 20, 50, 100]}
        onPageSizeChange={setPageSize}
      />
    )
  };
};
export const useCrumbs = (initial: { product?: string; project?: string } = {}) => {
  const [org, setOrg] = useState(rootOrg);
  const [product, setProduct] = useState(initial.product ?? "secrets");
  const [project, setProject] = useState(initial.project ?? "payments-api");
  const inSubOrg = org !== rootOrg;
  const productIcon = products.find((option) => option.value === product)?.icon ?? "apps";
  return {
    org: {
      label: labelOf(organizations, org),
      media: <Icon name="building" />,
      switcher: {
        label: "Switch organization",
        searchable: true,
        placeholder: "Search organizations",
        maxHeight: 400,
        options: [
          ...organizations.map((option) => ({
            ...option,
            media: option.group === "Sub-organizations" ? undefined : <Icon name="building" />
          })),
          {
            value: "new-sub-organization",
            label: "New sub-organization",
            group: "Sub-organizations",
            media: <Icon name="plus" />,
            disabled: inSubOrg,
            description: inSubOrg ? "Switch to Acme Corp to create one" : undefined,
            onSelect: () => {}
          }
        ],
        value: org,
        onChange: setOrg,
        actions: [{ label: "Organization settings", icon: "settings" }]
      }
    } satisfies BreadcrumbCrumb,
    product: {
      label: labelOf([...products], product),
      media: <Icon name={productIcon} />,
      switcher: {
        label: "Switch product",
        options: products.map((option) => ({
          value: option.value,
          label: option.label,
          group: "Products",
          media: <Icon name={option.icon} />
        })),
        value: product,
        onChange: setProduct
      }
    } satisfies BreadcrumbCrumb,
    project: {
      label: labelOf(projects, project),
      mono: true,
      switcher: { label: "Switch project", options: projects, value: project, onChange: setProject }
    } satisfies BreadcrumbCrumb
  };
};

const announcementItems: Announcement[] = [
  {
    id: "agent-vault",
    eyebrow: "October 30, 2026",
    title: "Agent Vault is in preview",
    description:
      "Give AI agents scoped access to the secrets and services they need, with every session recorded."
  },
  {
    id: "pam-recordings",
    eyebrow: "October 21, 2026",
    title: "Session recordings in PAM",
    description: "Replay brokered database and SSH sessions from the session detail page."
  }
];

export const useShellChrome = () => {
  const workbench = useWorkbench();
  const [localTheme, setLocalTheme] = useState<ShellTheme>("system");
  const [unseen, setUnseen] = useState(() => announcementItems.map((item) => item.id));
  const [announcementsOpen, setAnnouncementsOpen] = useState(false);
  const openAnnouncements = () => setAnnouncementsOpen(true);
  const account: TopBarAccount = {
    name: user.name,
    email: user.email,
    items: [
      { label: "Personal settings", icon: "user" },
      { label: "Invite users", icon: "user-plus" }
    ],
    theme: workbench?.theme ?? { value: localTheme, onChange: setLocalTheme },
    endItems: [
      { label: "Copy token", icon: "copy" },
      { type: "separator" },
      { label: "Log out", icon: LogOut }
    ]
  };
  const help: SidebarHelp = {
    status: { label: "All systems operational", href: "https://status.infisical.com" },
    whatsNew: { unread: unseen.length, latest: "Oct 30", onSelect: openAnnouncements },
    items: [
      {
        label: "Support Forum",
        icon: MessagesSquare,
        href: "https://community.infisical.com",
        external: true
      },
      {
        label: "Read Docs",
        icon: BookOpen,
        href: "https://infisical.com/docs/documentation/getting-started/introduction",
        external: true
      },
      {
        label: "GitHub Issues",
        icon: Github,
        href: "https://github.com/Infisical/infisical/issues",
        external: true
      },
      { label: "Email Support", icon: Mail, href: "mailto:support@infisical.com" }
    ],
    version: "56a8340"
  };
  return {
    search: { onClick: () => workbench?.openSearch() },
    notifications: { unread: 3 },
    account,
    help,
    announcements: { unread: unseen.length, onClick: openAnnouncements },
    dialog: (
      <Announcements
        items={announcementItems}
        open={announcementsOpen}
        onOpenChange={setAnnouncementsOpen}
        onSeen={(id) => setUnseen((ids) => ids.filter((entry) => entry !== id))}
      />
    )
  };
};

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
  const chrome = useShellChrome();
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
  const go = (target: { level: ShellLevel; page: string }) => {
    setAt(target);
    onNavigate?.(target.page);
  };
  const crumbPages: ({ level: ShellLevel; page: string } | undefined)[] = [
    { level: "org", page: "home" },
    { level: "product", page: "projects" },
    projectHome[initialProduct ?? "secrets"]
  ];
  const crumbs = (
    at.level === initialLevel && at.page === current ? initialCrumbs : trail[at.level]
  ).map((crumb, index) => {
    const target = crumbPages[index];
    return crumb.switcher && target ? { ...crumb, onNavigate: () => go(target) } : crumb;
  });
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
      <TopBar
        breadcrumb={crumbs}
        search={chrome.search}
        notifications={chrome.notifications}
        account={chrome.account}
      />
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
        help={chrome.help}
        announcements={chrome.announcements}
      />
      <AppInset>{children && <PageGutter>{children}</PageGutter>}</AppInset>
      {chrome.dialog}
    </AppShell>
  );
};
