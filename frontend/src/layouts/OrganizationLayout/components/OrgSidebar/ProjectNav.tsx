import { useState } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { DoorOpen, FileKey, Shield } from "lucide-react";

import { SidebarGroup, SidebarMenu } from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import { ProjectType } from "@app/hooks/api/projects/types";

import { AINav } from "./AINav";
import { CertManagerNav } from "./CertManagerNav";
import { KmsNav } from "./KmsNav";
import { PamNav } from "./PamNav";
import { SecretManagerNav } from "./SecretManagerNav";
import { SecretScanningNav } from "./SecretScanningNav";
import { SshNav } from "./SshNav";
import {
  CERT_APPROVALS_SUBMENU,
  CERT_CERTIFICATES_SUBMENU,
  CERT_CODE_SIGNING_SUBMENU,
  CERT_DISCOVERY_SUBMENU,
  CERT_SETTINGS_SUBMENU,
  INTEGRATIONS_SUBMENU,
  MCP_SUBMENU,
  PAM_APPROVALS_SUBMENU,
  PROJECT_ACCESS_CONTROL_SUBMENU,
  SECRET_SCANNING_SETTINGS_SUBMENU,
  SM_SETTINGS_SUBMENU
} from "./submenus";
import { ProjectSubmenuView } from "./SubmenuViews";
import type { Submenu } from "./types";
import { PROJECT_TYPE_PATH } from "./types";

const PROJECT_NAV_COMPONENT: Record<
  ProjectType,
  React.ComponentType<{ onSubmenuOpen: (submenu: Submenu) => void }>
> = {
  [ProjectType.SecretManager]: SecretManagerNav,
  [ProjectType.KMS]: KmsNav,
  [ProjectType.CertificateManager]: CertManagerNav,
  [ProjectType.SSH]: SshNav,
  [ProjectType.PAM]: PamNav,
  [ProjectType.AI]: AINav,
  [ProjectType.SecretScanning]: SecretScanningNav
};

// --- Project nav wrapper ---

export const ProjectNav = () => {
  const { currentProject } = useProject();
  const { currentOrg } = useOrganization();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const NavComponent = PROJECT_NAV_COMPONENT[currentProject.type];

  const isOnAccessControl =
    pathname.includes("/access-management") ||
    Boolean(pathname.match(/\/groups\/|\/identities\/|\/members\/|\/roles\//));
  const isOnIntegrations = pathname.includes("/integrations");
  const isOnProjectSettings = pathname.endsWith("/settings") || pathname.includes("/settings?");
  const isOnApproval = pathname.includes("/approval");
  const isOnMcpOverview = currentProject.type === ProjectType.AI && pathname.includes("/overview");
  const isCertManager = currentProject.type === ProjectType.CertificateManager;
  const isOnCertPolicies = isCertManager && pathname.includes("/policies");
  const isOnCertDiscovery = isCertManager && pathname.includes("/discovery");
  const isOnCertCodeSigning = isCertManager && pathname.includes("/code-signing");
  const isOnCertApprovals = isCertManager && pathname.includes("/approvals");

  const getInitialProjectSubmenu = (): Submenu | null => {
    if (isOnAccessControl) return PROJECT_ACCESS_CONTROL_SUBMENU;
    if (isOnIntegrations) return INTEGRATIONS_SUBMENU;
    if (isOnProjectSettings && currentProject.type === ProjectType.SecretManager)
      return SM_SETTINGS_SUBMENU;
    if (isOnProjectSettings && isCertManager) return CERT_SETTINGS_SUBMENU;
    if (isOnProjectSettings && currentProject.type === ProjectType.SecretScanning)
      return SECRET_SCANNING_SETTINGS_SUBMENU;
    if (isOnMcpOverview) return MCP_SUBMENU;
    if (isOnCertPolicies) return CERT_CERTIFICATES_SUBMENU;
    if (isOnCertDiscovery) return CERT_DISCOVERY_SUBMENU;
    if (isOnCertCodeSigning) return CERT_CODE_SIGNING_SUBMENU;
    if (isOnCertApprovals) return CERT_APPROVALS_SUBMENU;
    if (currentProject.type === ProjectType.PAM && pathname.includes("/approvals"))
      return PAM_APPROVALS_SUBMENU;
    if (isOnApproval)
      return {
        title: "Approvals",
        pathSuffix: "approval",
        defaultTab: "approval-requests",
        items: [
          { label: "Change Requests", icon: FileKey, tab: "approval-requests" },
          { label: "Access Requests", icon: DoorOpen, tab: "resource-requests" },
          { label: "Policies", icon: Shield, tab: "policies" }
        ]
      };
    return null;
  };

  const [activeSubmenu, setActiveSubmenu] = useState<Submenu | null>(getInitialProjectSubmenu);

  const handleSubmenuOpen = (submenu: Submenu) => {
    setActiveSubmenu(submenu);
    const typePath = PROJECT_TYPE_PATH[currentProject.type];
    navigate({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      to: `/organizations/$orgId/projects/${typePath}/$projectId/${submenu.pathSuffix}` as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      params: { orgId: currentOrg.id, projectId: currentProject.id } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      search: { selectedTab: submenu.defaultTab } as any
    });
  };

  return (
    <AnimatePresence mode="wait" initial={false}>
      {activeSubmenu ? (
        <motion.div
          key="submenu"
          initial={{ x: 30, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 30, opacity: 0 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
        >
          <ProjectSubmenuView submenu={activeSubmenu} onBack={() => setActiveSubmenu(null)} />
        </motion.div>
      ) : (
        <motion.div
          key="main"
          initial={{ x: -30, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -30, opacity: 0 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
        >
          <SidebarGroup>
            <SidebarMenu>
              <NavComponent onSubmenuOpen={handleSubmenuOpen} />
            </SidebarMenu>
          </SidebarGroup>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
