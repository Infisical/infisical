import {
  Bell,
  BookCheck,
  Cable,
  FileKey,
  FileText,
  Monitor,
  PenTool,
  Plug,
  Search,
  Settings,
  Shield,
  ShieldCheck
} from "lucide-react";

import { useProject, useSubscription } from "@app/context";
import {
  useListWorkspaceCertificateTemplates,
  useListWorkspacePkiSubscribers
} from "@app/hooks/api";

import { ProjectNavList } from "./ProjectNavLink";
import {
  CERT_APPROVALS_SUBMENU,
  CERT_CERTIFICATES_SUBMENU,
  CERT_CODE_SIGNING_SUBMENU,
  CERT_DISCOVERY_SUBMENU,
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

  const items: NavItem[] = [
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
    {
      label: "Certificate Authorities",
      icon: ShieldCheck,
      pathSuffix: "certificate-authorities",
      activeMatch: /\/ca\//
    },
    {
      label: "Code Signing",
      icon: PenTool,
      pathSuffix: "code-signing",
      activeMatch: /\/code-signing/,
      submenu: CERT_CODE_SIGNING_SUBMENU
    },
    { label: "Alerting", icon: Bell, pathSuffix: "alerting" },
    {
      label: "Approvals",
      icon: BookCheck,
      pathSuffix: "approvals",
      submenu: CERT_APPROVALS_SUBMENU
    },
    { label: "Integrations", icon: Plug, pathSuffix: "integrations" },
    { label: "App Connections", icon: Cable, pathSuffix: "app-connections" },
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
  return <ProjectNavList items={items} onSubmenuOpen={onSubmenuOpen} />;
};
