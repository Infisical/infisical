import { useEffect } from "react";
import { Link, Outlet, useLocation } from "@tanstack/react-router";
import { motion } from "framer-motion";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { Tab, TabList, Tabs } from "@app/components/v2";
import { useProject, useProjectPermission, useSubscription } from "@app/context";
import { usePopUp } from "@app/hooks";

import { AssumePrivilegeModeBanner } from "../ProjectLayout/components/AssumePrivilegeModeBanner";

export const PamLayout = () => {
  const { currentProject } = useProject();
  const { subscription } = useSubscription();
  const { assumedPrivilegeDetails } = useProjectPermission();
  const location = useLocation();
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["upgradePlan"]);

  useEffect(() => {
    if (subscription && !subscription.pam) {
      handlePopUpOpen("upgradePlan", {
        description:
          "Your current plan does not provide access to Infisical PAM. To unlock this feature, please upgrade to Infisical Enterprise plan.",
        isEnterpriseFeature: true
      });
    }
  }, [subscription]);

  return (
    <>
      <div className="dark flex h-full w-full flex-col overflow-x-hidden">
        <div className="border-b border-mineshaft-600 bg-mineshaft-900">
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
                    to="/projects/pam/$projectId/accounts"
                    params={{
                      projectId: currentProject.id
                    }}
                  >
                    {({ isActive }) => <Tab value={isActive ? "selected" : ""}>Accounts</Tab>}
                  </Link>
                  <Link
                    to="/projects/pam/$projectId/resources"
                    params={{
                      projectId: currentProject.id
                    }}
                  >
                    {({ isActive }) => <Tab value={isActive ? "selected" : ""}>Resources</Tab>}
                  </Link>
                  <Link
                    to="/projects/pam/$projectId/sessions"
                    params={{
                      projectId: currentProject.id
                    }}
                  >
                    {({ isActive }) => <Tab value={isActive ? "selected" : ""}>Sessions</Tab>}
                  </Link>
                  <Link
                    to="/projects/pam/$projectId/access-management"
                    params={{
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
                    to="/projects/pam/$projectId/audit-logs"
                    params={{
                      projectId: currentProject.id
                    }}
                  >
                    {({ isActive }) => <Tab value={isActive ? "selected" : ""}>Audit Logs</Tab>}
                  </Link>
                  <Link
                    to="/projects/pam/$projectId/settings"
                    params={{
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
