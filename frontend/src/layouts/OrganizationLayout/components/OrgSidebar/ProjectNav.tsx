import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft } from "lucide-react";

import { SidebarGroup, SidebarGroupLabel } from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import { hasIntermediateProjectsView, projectTypeToUrlSlug } from "@app/helpers/project";
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
  CERT_INTEGRATIONS_SUBMENU,
  MCP_SUBMENU,
  PAM_APPROVALS_SUBMENU,
  PAM_SETTINGS_SUBMENU,
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
  const { currentOrg, isSubOrganization } = useOrganization();
  const { pathname, search: locationSearch } = useLocation();
  const navigate = useNavigate();
  const isLegacyView = (locationSearch as { legacy?: string })?.legacy === "true";
  const hasApplicationContext = Boolean(
    (locationSearch as { applicationName?: string })?.applicationName
  );
  const isFromRootRequests = (locationSearch as { from?: string })?.from === "root-requests";
  const hasSignerContext = Boolean((locationSearch as { signerId?: string })?.signerId);
  const intermediateAvailable = hasIntermediateProjectsView(currentProject.type);
  let projectLabel: string;
  if (intermediateAvailable) projectLabel = "Projects";
  else if (isSubOrganization) projectLabel = "Sub-Organization";
  else projectLabel = "Organization";
  const NavComponent = PROJECT_NAV_COMPONENT[currentProject.type];

  // scott: we currently have to use this flaky inclusion for routes/nested routes because we haven't
  // been consistent in using a route structure that reflects nested pages; once we refactor we can switch
  // to using tanstack `isActive` link property
  const isOnAccessControl =
    pathname.includes("/access-management") ||
    Boolean(pathname.match(/\/groups\/|\/identities\/|\/members\/|\/roles\//));
  const isOnIntegrations = pathname.includes("/integrations");
  const isOnProjectSettings = /\/settings(\/|\?|$)/.test(pathname);
  const isOnMcpOverview = currentProject.type === ProjectType.AI && pathname.includes("/overview");
  const isCertManager = currentProject.type === ProjectType.CertificateManager;
  const isOnCertPolicies = isCertManager && pathname.includes("/policies");
  const isOnCertApprovals = isCertManager && pathname.includes("/approvals");

  const getInitialProjectSubmenu = (): Submenu | null => {
    if (isLegacyView || hasApplicationContext || isFromRootRequests || hasSignerContext)
      return null;
    if (isCertManager && (isOnAccessControl || pathname.includes("/discovery"))) return null;
    // Secret manager renders access control as in-page tabs (no secondary submenu).
    if (isOnAccessControl && currentProject.type !== ProjectType.SecretManager)
      return PROJECT_ACCESS_CONTROL_SUBMENU;
    if (isOnIntegrations && isCertManager) return CERT_INTEGRATIONS_SUBMENU;
    if (isOnProjectSettings && currentProject.type === ProjectType.SecretManager)
      return SM_SETTINGS_SUBMENU;
    if (isOnProjectSettings && currentProject.type === ProjectType.SecretScanning)
      return SECRET_SCANNING_SETTINGS_SUBMENU;
    if (isOnProjectSettings && currentProject.type === ProjectType.PAM) return PAM_SETTINGS_SUBMENU;
    if (isOnMcpOverview) return MCP_SUBMENU;
    if (isOnCertPolicies) return CERT_CERTIFICATES_SUBMENU;
    if (isOnCertApprovals) return CERT_APPROVALS_SUBMENU;
    if (currentProject.type === ProjectType.PAM && pathname.includes("/approvals"))
      return PAM_APPROVALS_SUBMENU;
    return null;
  };

  const [activeSubmenu, setActiveSubmenu] = useState<Submenu | null>(getInitialProjectSubmenu);

  useEffect(() => {
    setActiveSubmenu(getInitialProjectSubmenu());
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmenuOpen = (submenu: Submenu) => {
    setActiveSubmenu(submenu);
    const typePath = PROJECT_TYPE_PATH[currentProject.type];
    // Already on this submenu's page (e.g. after collapsing via the "< back" button):
    // re-navigating to the same URL would push a duplicate history entry, so just re-expand.
    const submenuPath = `/organizations/${currentOrg.id}/projects/${typePath}/${currentProject.id}/${submenu.pathSuffix}`;
    if (pathname === submenuPath || pathname.startsWith(`${submenuPath}/`)) return;
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
          transition={{ duration: 0.11, ease: "easeOut" }}
        >
          <ProjectSubmenuView submenu={activeSubmenu} onBack={() => setActiveSubmenu(null)} />
        </motion.div>
      ) : (
        <motion.div
          key="main"
          initial={{ x: -30, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -30, opacity: 0 }}
          transition={{ duration: 0.11, ease: "easeOut" }}
        >
          <SidebarGroup>
            <SidebarGroupLabel asChild>
              <button
                className="cursor-pointer hover:bg-foreground/[0.025]"
                type="button"
                onClick={() => {
                  if (intermediateAvailable) {
                    navigate({
                      to: "/organizations/$orgId/projects/$type",
                      params: {
                        orgId: currentOrg.id,
                        type: projectTypeToUrlSlug(currentProject.type)
                      }
                    });
                    return;
                  }
                  navigate({
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    to: "/organizations/$orgId/projects" as any,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    params: { orgId: currentOrg.id } as any
                  });
                }}
              >
                <ChevronLeft />
                <span>{projectLabel}</span>
              </button>
            </SidebarGroupLabel>
            <NavComponent onSubmenuOpen={handleSubmenuOpen} />
          </SidebarGroup>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
