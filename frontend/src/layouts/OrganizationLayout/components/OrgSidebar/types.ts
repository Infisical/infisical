import { ProjectType } from "@app/hooks/api/projects/types";

export const PROJECT_TYPE_PATH: Record<ProjectType, string> = {
  [ProjectType.SecretManager]: "secret-management",
  [ProjectType.CertificateManager]: "cert-manager",
  [ProjectType.SSH]: "ssh",
  [ProjectType.KMS]: "kms",
  [ProjectType.PAM]: "pam",
  [ProjectType.SecretScanning]: "secret-scanning",
  [ProjectType.AI]: "ai"
};

export type SubmenuItem = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  tab: string;
  badgeCount?: number;
  /** Extra regex to match detail pages (e.g. /members/$id) */
  activeMatch?: RegExp;
};

export type Submenu = {
  title: string;
  items: SubmenuItem[];
  pathSuffix: string;
  defaultTab: string;
  /** Extra regex to consider the submenu's page as active (for detail pages) */
  activeMatch?: RegExp;
};

export type NavItem = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  pathSuffix: string;
  activeMatch?: RegExp | ((pathname: string, search: Record<string, unknown>) => boolean);
  badgeCount?: number;
  badgeVariant?: "warning" | "danger" | "pam";
  hidden?: boolean;
  submenu?: Submenu;
  /** For SSH CA permission gating */
  permissionCheck?: boolean;
  /** Query params to append to the link and use for active state matching */
  search?: Record<string, string>;
  /** When true, this item is also active when the path matches but search keys are absent from the URL */
  isDefaultSearch?: boolean;
  exactPath?: boolean;
};

export type OrgNavItem = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Path segment under /organizations/$orgId/ */
  pathSuffix: string;
  /** Extra regex for detail pages living outside pathSuffix (e.g. /members/$id) */
  activeMatch?: RegExp;
  hidden?: boolean;
  /** Query params to append to the link and use for active state matching */
  search?: Record<string, string>;
  /** When true, this item is also active when the path matches but search keys are absent from the URL */
  isDefaultSearch?: boolean;
  /** When true, the item renders as a trigger that opens the settings submenu instead of a link */
  opensSubmenu?: boolean;
};

export type OrgNavGroup = {
  label: string;
  items: OrgNavItem[];
  defaultOpen?: boolean;
  /** When false, the group is always expanded and its label is not clickable. */
  collapsible?: boolean;
};
