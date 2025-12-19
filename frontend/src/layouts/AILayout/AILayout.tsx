import { useEffect } from "react";
import { Link, Outlet, useLocation } from "@tanstack/react-router";
import { motion } from "framer-motion";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { Tab, TabList, Tabs } from "@app/components/v2";
import { useOrganization, useProject, useProjectPermission, useSubscription } from "@app/context";
import { usePopUp } from "@app/hooks";

import { AssumePrivilegeModeBanner } from "../ProjectLayout/components/AssumePrivilegeModeBanner";

export const AILayout = () => {
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const { subscription } = useSubscription();
  const { assumedPrivilegeDetails } = useProjectPermission();
  const location = useLocation();
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["upgradePlan"]);

  useEffect(() => {
    if (subscription && !subscription.ai) {
      handlePopUpOpen("upgradePlan", {
        description:
          "Your current plan does not provide access to Infisical AI. To unlock this feature, please upgrade to Infisical Enterprise plan.",
        isEnterpriseFeature: true
      });
    }
  }, [subscription]);

  return (
    <>
      <div className="dark flex h-full w-full flex-col overflow-x-hidden bg-mineshaft-900">
        <div className="border-y border-t-project/10 border-b-project/5 bg-gradient-to-b from-project/[0.075] to-project/[0.025] px-4 pt-0.5">
          <motion.div
            key="menu-project-items"
            initial={{ x: -150 }}
            animate={{ x: 0 }}
            exit={{ x: -150 }}
            transition={{ duration: 0.2 }}
            className="px-4"
          >
            <nav className="w-full">
              <Tabs value="selected">
                <TabList className="border-b-0">
                  <Link
                    to="/organizations/$orgId/projects/ai/$projectId/overview"
                    params={{
                      orgId: currentOrg.id,
                      projectId: currentProject.id
                    }}
                  >
                    {({ isActive }) => <Tab value={isActive ? "selected" : ""}>MCP</Tab>}
                  </Link>
                  <Link
                    to="/organizations/$orgId/projects/ai/$projectId/access-management"
                    params={{
                      orgId: currentOrg.id,
                      projectId: currentProject.id
                    }}
                  >
                    {({ isActive }) => (
                      <Tab
                        value={
                          isActive ||
                          location.pathname.match(/\/groups\/|\/identities\/|\/members\/|\/roles\//)
                            ? "selected"
                            : ""
                        }
                      >
                        Access Control
                      </Tab>
                    )}
                  </Link>
                  <Link
                    to="/organizations/$orgId/projects/ai/$projectId/audit-logs"
                    params={{
                      orgId: currentOrg.id,
                      projectId: currentProject.id
                    }}
                  >
                    {({ isActive }) => <Tab value={isActive ? "selected" : ""}>Audit Logs</Tab>}
                  </Link>
                  <Link
                    to="/organizations/$orgId/projects/ai/$projectId/settings"
                    params={{
                      orgId: currentOrg.id,
                      projectId: currentProject.id
                    }}
                  >
                    {({ isActive }) => <Tab value={isActive ? "selected" : ""}>Settings</Tab>}
                  </Link>
                </TabList>
              </Tabs>
            </nav>
          </motion.div>
        </div>
        {assumedPrivilegeDetails && <AssumePrivilegeModeBanner />}
        <div className="flex-1 overflow-x-hidden overflow-y-auto bg-bunker-800 px-12 pt-10 pb-4">
          <Outlet />
        </div>
      </div>
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => {
          handlePopUpToggle("upgradePlan", isOpen);
        }}
        text={popUp.upgradePlan.data?.description}
        isEnterpriseFeature={popUp.upgradePlan.data?.isEnterpriseFeature}
      />
    </>
  );
};
