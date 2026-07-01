import {
  ArrowLeftRight,
  Cable,
  ClipboardList,
  Cog,
  FileCheck,
  FileKey,
  FileText,
  HardDrive,
  IdCardLanyard,
  Key,
  Layers,
  Lock,
  MapPin,
  Plug,
  ScanSearch,
  Search,
  Server,
  Shield,
  Tag,
  User,
  Users,
  Video,
  Webhook
} from "lucide-react";

import type { Submenu } from "./types";

// --- Shared submenu definitions ---

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

export const CERT_MANAGER_ACCESS_CONTROL_SUBMENU: Submenu = {
  title: "Access Control",
  pathSuffix: "access-management",
  defaultTab: "members",
  activeMatch: /\/members\/|\/groups\/|\/identities\//,
  items: [
    { label: "Users", icon: User, tab: "members", activeMatch: /\/members\// },
    { label: "Groups", icon: Users, tab: "groups", activeMatch: /\/groups\// },
    {
      label: "Machine Identities",
      icon: HardDrive,
      tab: "identities",
      activeMatch: /\/identities\//
    }
  ]
};

export const SM_SETTINGS_SUBMENU: Submenu = {
  title: "Settings",
  pathSuffix: "settings",
  defaultTab: "tab-project-general",
  items: [
    { label: "General", icon: Cog, tab: "tab-project-general" },
    { label: "Environments", icon: Layers, tab: "tab-secret-environments" },
    { label: "Tags", icon: Tag, tab: "tab-secret-tags" },
    { label: "Policies", icon: Shield, tab: "tab-secret-policies" },
    { label: "Encryption", icon: Lock, tab: "tab-project-encryption" },
    { label: "Workflow Integrations", icon: Plug, tab: "tab-workflow-integrations" },
    { label: "Webhooks", icon: Webhook, tab: "tab-project-webhooks" }
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

export const PAM_SETTINGS_SUBMENU: Submenu = {
  title: "Settings",
  pathSuffix: "settings",
  defaultTab: "tab-project-general",
  items: [
    { label: "General", icon: Cog, tab: "tab-project-general" },
    { label: "Session Recording", icon: Video, tab: "tab-pam-session-recording" }
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
