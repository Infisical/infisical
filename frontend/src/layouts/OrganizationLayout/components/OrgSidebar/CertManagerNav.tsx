import {
  Bell,
  BookCheck,
  FileCheck,
  FileKey,
  FileText,
  Key,
  LayoutDashboard,
  Monitor,
  PenTool,
  Plug,
  Search,
  Settings,
  Shield,
  ShieldCheck
} from "lucide-react";

import { SidebarCollapsibleGroup, SidebarMenu } from "@app/components/v3";
import { useProject, useSubscription } from "@app/context";
import {
  useListWorkspaceCertificateTemplates,
  useListWorkspacePkiSubscribers
} from "@app/hooks/api";

import { ProjectNavLink, ProjectNavList } from "./ProjectNavLink";
import {
  CERT_APPROVALS_SUBMENU,
  CERT_CERTIFICATES_SUBMENU,
  CERT_DISCOVERY_SUBMENU,
  CERT_INTEGRATIONS_SUBMENU,
  CERT_SETTINGS_SUBMENU,
  PROJECT_ACCESS_CONTROL_SUBMENU
} from "./submenus";
import type { NavItem, Submenu } from "./types";

export const CertManagerNav = ({
  onSubmenuOpen
}: {
  onSubmenuOpen: (submenu: Submenu) => void;
}) => {
  const { currentProject } = useProject();
  const { subscription } = useSubscription();
  const { data: subscribers = [] } = useListWorkspacePkiSubscribers(currentProject?.id || "");
  const { data: templatesData } = useListWorkspaceCertificateTemplates({
    projectId: currentProject?.id || ""
  });
  const templates = templatesData?.certificateTemplates || [];

  const dashboardItem: NavItem = {
    label: "Dashboard",
    icon: LayoutDashboard,
    pathSuffix: "overview"
  };

  const certInfraItems: NavItem[] = [
    {
      label: "Certificate Authorities",
      icon: ShieldCheck,
      pathSuffix: "certificate-authorities",
      activeMatch: /\/ca\//
    },
    {
      label: "Certificates",
      icon: FileKey,
      pathSuffix: "policies",
      submenu: CERT_CERTIFICATES_SUBMENU
    },
    {
      label: "Discovery",
      icon: Search,
      pathSuffix: "discovery",
      activeMatch: /\/discovery/,
      submenu: CERT_DISCOVERY_SUBMENU
    },
    { label: "Alerting", icon: Bell, pathSuffix: "alerting" },
    {
      label: "Approvals",
      icon: BookCheck,
      pathSuffix: "approvals",
      submenu: CERT_APPROVALS_SUBMENU
    },
    {
      label: "Subscribers (Legacy)",
      icon: Monitor,
      pathSuffix: "subscribers",
      hidden: !(subscription.pkiLegacyTemplates || subscribers.length > 0)
    },
    {
      label: "Certificate Templates (Legacy)",
      icon: FileKey,
      pathSuffix: "certificate-templates",
      hidden: !(subscription.pkiLegacyTemplates || templates.length > 0)
    }
  ];

  const codeSigningItems: NavItem[] = [
    {
      label: "Signers",
      icon: PenTool,
      pathSuffix: "code-signing",
      activeMatch: /\/code-signing/,
      search: { selectedTab: "signers" },
      isDefaultSearch: true
    },
    {
      label: "Signing Requests",
      icon: FileCheck,
      pathSuffix: "code-signing",
      activeMatch: /\/code-signing/,
      search: { selectedTab: "signing-requests" }
    },
    {
      label: "Signing Policies",
      icon: Shield,
      pathSuffix: "code-signing",
      activeMatch: /\/code-signing/,
      search: { selectedTab: "signing-policies" }
    },
    {
      label: "Grants",
      icon: Key,
      pathSuffix: "code-signing",
      activeMatch: /\/code-signing/,
      search: { selectedTab: "grants" }
    }
  ];

  const generalItems: NavItem[] = [
    {
      label: "Integrations",
      icon: Plug,
      pathSuffix: "integrations",
      submenu: CERT_INTEGRATIONS_SUBMENU
    },
    {
      label: "Access Control",
      icon: Shield,
      pathSuffix: "access-management",
      activeMatch: /\/groups\/|\/identities\/|\/members\/|\/roles\//,
      submenu: PROJECT_ACCESS_CONTROL_SUBMENU
    },
    { label: "Audit Logs", icon: FileText, pathSuffix: "audit-logs" },
    {
      label: "Settings",
      icon: Settings,
      pathSuffix: "settings",
      submenu: CERT_SETTINGS_SUBMENU
    }
  ];

  return (
    <>
      <SidebarMenu>
        <ProjectNavLink item={dashboardItem} />
      </SidebarMenu>
      <SidebarCollapsibleGroup label="Certificate Infrastructure">
        <ProjectNavList items={certInfraItems} onSubmenuOpen={onSubmenuOpen} />
      </SidebarCollapsibleGroup>
      <SidebarCollapsibleGroup label="Code Signing">
        <ProjectNavList items={codeSigningItems} onSubmenuOpen={onSubmenuOpen} />
      </SidebarCollapsibleGroup>
      <SidebarCollapsibleGroup label="General">
        <ProjectNavList items={generalItems} onSubmenuOpen={onSubmenuOpen} />
      </SidebarCollapsibleGroup>
    </>
  );
};
