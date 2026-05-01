import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  Blocks,
  Cable,
  ClipboardList,
  Cog,
  Container,
  Database,
  DoorOpen,
  FileCheck,
  FileKey,
  FileText,
  FolderCog,
  HardDrive,
  IdCardLanyard,
  Key,
  Lock,
  MapPin,
  Plug,
  Route,
  ScanSearch,
  Search,
  Server,
  Settings,
  Shield,
  ShieldCheck,
  ShieldUser,
  Trash2,
  User,
  Users
} from "lucide-react";

import { SubOrgIcon } from "@app/components/v3";

import type { Submenu } from "./types";

// --- Shared submenu definitions ---

export const ORG_ACCESS_CONTROL_SUBMENU: Submenu = {
  title: "Access Control",
  pathSuffix: "access-management",
  defaultTab: "members",
  activeMatch: /\/members\/|\/groups\/|\/identities\/|\/roles\//,
  items: [
    { label: "Members", icon: User, tab: "members", activeMatch: /\/members\// },
    { label: "Groups", icon: Users, tab: "groups", activeMatch: /\/groups\// },
    {
      label: "Machine Identities",
      icon: HardDrive,
      tab: "identities",
      activeMatch: /\/identities\//
    },
    { label: "Roles", icon: IdCardLanyard, tab: "roles", activeMatch: /\/roles\// }
  ]
};

export const PROJECT_ACCESS_CONTROL_SUBMENU: Submenu = {
  title: "Access Control",
  pathSuffix: "access-management",
  defaultTab: "members",
  activeMatch: /\/members\/|\/groups\/|\/identities\/|\/roles\//,
  items: [
    { label: "Users", icon: User, tab: "members", activeMatch: /\/members\// },
    { label: "Groups", icon: Users, tab: "groups", activeMatch: /\/groups\// },
    {
      label: "Machine Identities",
      icon: HardDrive,
      tab: "identities",
      activeMatch: /\/identities\//
    },
    { label: "Roles", icon: IdCardLanyard, tab: "roles", activeMatch: /\/roles\// }
  ]
};

export const SECRET_MANAGER_ACCESS_CONTROL_SUBMENU: Submenu = {
  ...PROJECT_ACCESS_CONTROL_SUBMENU,
  items: [
    ...PROJECT_ACCESS_CONTROL_SUBMENU.items,
    { label: "Service Tokens", icon: Key, tab: "service-tokens" }
  ]
};

export const SM_SETTINGS_SUBMENU: Submenu = {
  title: "Settings",
  pathSuffix: "settings",
  defaultTab: "tab-project-general",
  items: [
    { label: "General", icon: Cog, tab: "tab-project-general" },
    { label: "Secrets Management", icon: FileKey, tab: "tab-secret-general" },
    { label: "Secret Validation Rules", icon: ShieldCheck, tab: "tab-secret-validation-rules" },
    { label: "Encryption", icon: Lock, tab: "tab-project-encryption" },
    { label: "Workflow Integrations", icon: Plug, tab: "tab-workflow-integrations" },
    { label: "Webhooks", icon: Cable, tab: "tab-project-webhooks" }
  ]
};

export const INTEGRATIONS_SUBMENU: Submenu = {
  title: "Integrations",
  pathSuffix: "integrations",
  defaultTab: "app-connections",
  items: [
    { label: "App Connections", icon: Cable, tab: "app-connections" },
    { label: "Secret Syncs", icon: ArrowLeftRight, tab: "secret-syncs" },
    { label: "Framework Integrations", icon: Blocks, tab: "framework-integrations" },
    { label: "Infrastructure Integrations", icon: Container, tab: "infrastructure-integrations" },
    { label: "Native Integrations", icon: Plug, tab: "native-integrations" }
  ]
};

export const getOrgSettingsSubmenu = ({
  isSubOrganization,
  hasSubOrganization
}: {
  isSubOrganization: boolean;
  hasSubOrganization: boolean;
}): Submenu => ({
  title: "Settings",
  pathSuffix: "settings",
  defaultTab: "tab-org-general",
  items: [
    { label: "General", icon: Cog, tab: "tab-org-general" },
    ...(!isSubOrganization
      ? [
          { label: "SSO", icon: ShieldUser, tab: "sso-settings" },
          { label: "Provisioning", icon: Route, tab: "provisioning-settings" },
          { label: "Security", icon: ShieldCheck, tab: "tab-org-security" }
        ]
      : []),
    { label: "Encryption", icon: Lock, tab: "tab-org-encryption" },
    { label: "Workflow Integrations", icon: Plug, tab: "workflow-integrations" },
    { label: "Audit Log Streams", icon: FileText, tab: "tag-audit-log-streams" },
    { label: "External Migrations", icon: Database, tab: "tab-external-migrations" },
    { label: "Project Templates", icon: FolderCog, tab: "project-templates" },
    { label: "Product Enforcements", icon: ClipboardList, tab: "product-enforcements" },
    ...(!isSubOrganization && hasSubOrganization
      ? [{ label: "Sub Organizations", icon: SubOrgIcon, tab: "tab-sub-organizations" }]
      : [])
  ]
});

export const getSecretSharingSubmenu = ({
  isSubOrganization
}: {
  isSubOrganization: boolean;
}): Submenu => ({
  title: "Secret Sharing",
  pathSuffix: "secret-sharing",
  defaultTab: "share-secret",
  items: [
    { label: "Share Secrets", icon: ArrowUpFromLine, tab: "share-secret" },
    { label: "Request Secrets", icon: ArrowDownToLine, tab: "request-secret" },
    ...(!isSubOrganization ? [{ label: "Settings", icon: Settings, tab: "settings" }] : [])
  ]
});

export const NETWORKING_SUBMENU: Submenu = {
  title: "Networking",
  pathSuffix: "networking",
  defaultTab: "gateways",
  items: [
    { label: "Gateways", icon: DoorOpen, tab: "gateways" },
    { label: "Relays", icon: Route, tab: "relays" }
  ]
};

// --- Cert manager submenus ---

export const CERT_CERTIFICATES_SUBMENU: Submenu = {
  title: "Certificates",
  pathSuffix: "policies",
  defaultTab: "certificates",
  items: [
    { label: "Certificates", icon: FileKey, tab: "certificates" },
    { label: "Certificate Requests", icon: FileCheck, tab: "certificate-requests" },
    { label: "Certificate Profiles", icon: ClipboardList, tab: "profiles" },
    { label: "Certificate Policies", icon: Shield, tab: "policies" }
  ]
};

export const CERT_DISCOVERY_SUBMENU: Submenu = {
  title: "Discovery",
  pathSuffix: "discovery",
  defaultTab: "jobs",
  items: [
    { label: "Jobs", icon: Search, tab: "jobs" },
    { label: "Installations", icon: MapPin, tab: "installations" }
  ]
};

export const CERT_APPROVALS_SUBMENU: Submenu = {
  title: "Approvals",
  pathSuffix: "approvals",
  defaultTab: "requests",
  items: [
    { label: "Requests", icon: FileCheck, tab: "requests" },
    { label: "Policies", icon: Shield, tab: "policies" }
  ]
};

export const CERT_SETTINGS_SUBMENU: Submenu = {
  title: "Settings",
  pathSuffix: "settings",
  defaultTab: "general",
  items: [
    { label: "General", icon: Cog, tab: "general" },
    { label: "Certificate Cleanup", icon: Trash2, tab: "certificate-cleanup" }
  ]
};

export const CERT_INTEGRATIONS_SUBMENU: Submenu = {
  title: "Integrations",
  pathSuffix: "integrations",
  defaultTab: "app-connections",
  items: [
    { label: "App Connections", icon: Cable, tab: "app-connections" },
    { label: "Certificate Syncs", icon: ArrowLeftRight, tab: "pki-syncs" }
  ]
};

// --- Secret scanning submenus ---

export const SECRET_SCANNING_SETTINGS_SUBMENU: Submenu = {
  title: "Settings",
  pathSuffix: "settings",
  defaultTab: "general",
  items: [
    { label: "General", icon: Cog, tab: "general" },
    { label: "Scanning Settings", icon: ScanSearch, tab: "scanning-settings" }
  ]
};

// --- PAM submenus ---

export const PAM_APPROVALS_SUBMENU: Submenu = {
  title: "Approvals",
  pathSuffix: "approvals",
  defaultTab: "requests",
  items: [
    { label: "Requests", icon: FileCheck, tab: "requests" },
    { label: "Policies", icon: Shield, tab: "policies" },
    { label: "Grants", icon: Key, tab: "grants" }
  ]
};

// --- AI submenus ---

export const MCP_SUBMENU: Submenu = {
  title: "MCP",
  pathSuffix: "overview",
  defaultTab: "mcp-endpoints",
  items: [
    { label: "MCP Endpoints", icon: Server, tab: "mcp-endpoints" },
    { label: "MCP Servers", icon: HardDrive, tab: "mcp-servers" },
    { label: "Activity Logs", icon: FileText, tab: "activity-logs" }
  ]
};
