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
  activeMatch?: RegExp;
  badgeCount?: number;
  hidden?: boolean;
  submenu?: Submenu;
  /** For SSH CA permission gating */
  permissionCheck?: boolean;
  /** Query params to append to the link and use for active state matching */
  search?: Record<string, string>;
};

export type OrgNavItem = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  to: string;
  isActive: boolean;
  submenu?: Submenu;
};
