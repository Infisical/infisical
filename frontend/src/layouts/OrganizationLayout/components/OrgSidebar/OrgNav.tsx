import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { Blocks, CreditCard, FileText, Settings, Shield, Users } from "lucide-react";

import { OrgIcon, SubOrgIcon } from "@app/components/v3";
import { useOrganization } from "@app/context";

import { OrgNavList } from "./OrgNavLink";
import { OrgSettingsSubmenuView } from "./OrgSubmenuView";
import type { OrgNavItem } from "./types";

// --- Org nav ---

export const OrgNav = () => {
  const { currentOrg, isRootOrganization } = useOrganization();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  // /settings, /sso, /networking and /oauth-applications all live under the settings submenu.
  const isOnSettingsArea =
    /\/organizations\/[^/]+\/(settings|sso|networking|oauth-applications)(\/|$)/.test(pathname);
  const [showSettings, setShowSettings] = useState(isOnSettingsArea);

  useEffect(() => {
    setShowSettings(isOnSettingsArea);
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleOpenSettings = () => {
    setShowSettings(true);
    // Already on a settings-area URL (e.g. after collapsing via "< Settings"):
    // re-navigating would push a duplicate same-URL history entry, so just
    // re-expand the sub-nav.
    if (isOnSettingsArea) return;
    navigate({
      to: "/organizations/$orgId/settings",
      params: { orgId: currentOrg.id },
      search: { selectedTab: "" }
    });
  };

  const items: OrgNavItem[] = [
    {
      label: "Projects",
      icon: isRootOrganization ? OrgIcon : SubOrgIcon,
      pathSuffix: "projects"
    },
    {
      label: "Integrations",
      icon: Blocks,
      pathSuffix: "integrations",
      // Keep highlighted on the app-connections OAuth/manifest callback pages
      activeMatch: /organizations\/[^/]+\/app-connections/
    },
    {
      label: "PAM",
      icon: Users,
      pathSuffix: "pam/access",
      activeMatch: /organizations\/[^/]+\/pam\//
    },
    {
      label: "Access Control",
      icon: Shield,
      pathSuffix: "access-management",
      activeMatch: /organizations\/[^/]+\/(members|identities|groups|roles)/
    },
    {
      label: "Usage & Billing",
      icon: CreditCard,
      pathSuffix: "billing",
      hidden: !isRootOrganization
    },
    { label: "Audit Logs", icon: FileText, pathSuffix: "audit-logs" },
    { label: "Settings", icon: Settings, pathSuffix: "settings", opensSubmenu: true }
  ];

  return (
    <AnimatePresence mode="wait" initial={false}>
      {showSettings ? (
        <motion.div
          key="submenu"
          initial={{ x: 30, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 30, opacity: 0 }}
          transition={{ duration: 0.11, ease: "easeOut" }}
        >
          <OrgSettingsSubmenuView onBack={() => setShowSettings(false)} />
        </motion.div>
      ) : (
        <motion.div
          key="main"
          initial={{ x: -30, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -30, opacity: 0 }}
          transition={{ duration: 0.11, ease: "easeOut" }}
        >
          <div className="py-2">
            <OrgNavList items={items} onOpenSubmenu={handleOpenSettings} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
