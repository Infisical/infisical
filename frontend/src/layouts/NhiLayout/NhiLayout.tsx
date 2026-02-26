import { Link, Outlet, useLocation } from "@tanstack/react-router";
import { motion } from "framer-motion";

import { Tab, TabList, Tabs } from "@app/components/v2";
import { useOrganization, useProject, useProjectPermission } from "@app/context";

import { AssumePrivilegeModeBanner } from "../ProjectLayout/components/AssumePrivilegeModeBanner";

export const NhiLayout = () => {
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const { assumedPrivilegeDetails } = useProjectPermission();
  const location = useLocation();

  return (
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
                  to="/organizations/$orgId/projects/nhi/$projectId/overview"
                  params={{
                    orgId: currentOrg.id,
                    projectId: currentProject.id
                  }}
                >
                  {({ isActive }) => <Tab value={isActive ? "selected" : ""}>Overview</Tab>}
                </Link>
                <Link
                  to="/organizations/$orgId/projects/nhi/$projectId/discovered-identities"
                  params={{
                    orgId: currentOrg.id,
                    projectId: currentProject.id
                  }}
                >
                  {({ isActive }) => (
                    <Tab
                      value={
                        isActive || location.pathname.includes("/discovered-identities/")
                          ? "selected"
                          : ""
                      }
                    >
                      Identities
                    </Tab>
                  )}
                </Link>
                <Link
                  to="/organizations/$orgId/projects/nhi/$projectId/sources"
                  params={{
                    orgId: currentOrg.id,
                    projectId: currentProject.id
                  }}
                >
                  {({ isActive }) => <Tab value={isActive ? "selected" : ""}>Sources</Tab>}
                </Link>
                <Link
                  to="/organizations/$orgId/projects/nhi/$projectId/access-management"
                  params={{
                    orgId: currentOrg.id,
                    projectId: currentProject.id
                  }}
                >
                  {({ isActive }) => (
                    <Tab
                      value={
                        isActive || location.pathname.match(/\/groups\/|\/members\/|\/roles\//)
                          ? "selected"
                          : ""
                      }
                    >
                      Access Control
                    </Tab>
                  )}
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
  );
};
