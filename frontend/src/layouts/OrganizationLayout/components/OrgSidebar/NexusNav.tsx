import {
  AlertTriangle,
  Cable,
  Eye,
  FileText,
  Key,
  LayoutDashboard,
  Search,
  Settings,
  Shield,
  ShieldCheck
} from "lucide-react";

import { ProjectNavList } from "./ProjectNavLink";
import { PROJECT_ACCESS_CONTROL_SUBMENU } from "./submenus";
import type { NavItem, Submenu } from "./types";

export const NexusNav = ({ onSubmenuOpen }: { onSubmenuOpen: (submenu: Submenu) => void }) => {
  const items: NavItem[] = [
    { label: "Overview", icon: LayoutDashboard, pathSuffix: "overview" },
    { label: "PQC Readiness", icon: ShieldCheck, pathSuffix: "pqc-readiness" },
    { label: "Certificates", icon: FileText, pathSuffix: "certificates" },
    { label: "Cryptographic Assets", icon: Key, pathSuffix: "cryptographic-assets" },
    { label: "Discovery", icon: Search, pathSuffix: "discovery" },
    { label: "Policies", icon: Eye, pathSuffix: "policies" },
    { label: "Violations", icon: AlertTriangle, pathSuffix: "violations" },
    { label: "Integrations", icon: Cable, pathSuffix: "integrations" },
    { label: "Audit Logs", icon: FileText, pathSuffix: "audit-logs" },
    {
      label: "Access Control",
      icon: Shield,
      pathSuffix: "access-management",
      activeMatch: /\/groups\/|\/identities\/|\/members\/|\/roles\//,
      submenu: PROJECT_ACCESS_CONTROL_SUBMENU
    },
    { label: "Settings", icon: Settings, pathSuffix: "settings" }
  ];
  return <ProjectNavList items={items} onSubmenuOpen={onSubmenuOpen} />;
};
