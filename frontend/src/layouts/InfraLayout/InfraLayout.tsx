import { Link, Outlet, useLocation } from "@tanstack/react-router";
import { motion } from "framer-motion";

import { Tab, TabList, Tabs } from "@app/components/v2";
import { useOrganization, useProject, useProjectPermission } from "@app/context";

import { AssumePrivilegeModeBanner } from "../ProjectLayout/components/AssumePrivilegeModeBanner";

export const InfraLayout = () => {
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const { assumedPrivilegeDetails } = useProjectPermission();
  const location = useLocation();

  const baseParams = {
    orgId: currentOrg.id,
    projectId: currentProject.id
  };

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
                  to="/organizations/$orgId/projects/infra/$projectId/overview"
                  params={baseParams}
                >
                  {({ isActive }) => (
                    <Tab value={isActive ? "selected" : ""}>Dashboard</Tab>
                  )}
                </Link>
                <Link
                  to="/organizations/$orgId/projects/infra/$projectId/runs"
                  params={baseParams}
                >
                  {({ isActive }) => (
                    <Tab
                      value={
                        isActive || location.pathname.match(/\/run\//)
                          ? "selected"
                          : ""
                      }
                    >
                      Runs
                    </Tab>
                  )}
                </Link>
                <Link
                  to="/organizations/$orgId/projects/infra/$projectId/resources"
                  params={baseParams}
                >
                  {({ isActive }) => (
                    <Tab value={isActive ? "selected" : ""}>Resources</Tab>
                  )}
                </Link>
                <Link
                  to="/organizations/$orgId/projects/infra/$projectId/state"
                  params={baseParams}
                >
                  {({ isActive }) => (
                    <Tab value={isActive ? "selected" : ""}>State</Tab>
                  )}
                </Link>
                <Link
                  to="/organizations/$orgId/projects/infra/$projectId/variables"
                  params={baseParams}
                >
                  {({ isActive }) => (
                    <Tab value={isActive ? "selected" : ""}>Variables</Tab>
                  )}
                </Link>
                <Link
                  to="/organizations/$orgId/projects/infra/$projectId/editor"
                  params={baseParams}
                >
                  {({ isActive }) => (
                    <Tab value={isActive ? "selected" : ""}>Editor</Tab>
                  )}
                </Link>
                <Link
                  to="/organizations/$orgId/projects/infra/$projectId/access-management"
                  params={baseParams}
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
                  to="/organizations/$orgId/projects/infra/$projectId/audit-logs"
                  params={baseParams}
                >
                  {({ isActive }) => (
                    <Tab value={isActive ? "selected" : ""}>Audit Logs</Tab>
                  )}
                </Link>
                <Link
                  to="/organizations/$orgId/projects/infra/$projectId/settings"
                  params={baseParams}
                >
                  {({ isActive }) => (
                    <Tab value={isActive ? "selected" : ""}>Settings</Tab>
                  )}
                </Link>
              </TabList>
            </Tabs>
          </nav>
        </motion.div>
      </div>
      {assumedPrivilegeDetails && <AssumePrivilegeModeBanner />}
      <div
        className={`flex-1 overflow-x-hidden bg-bunker-800 ${
          location.pathname.endsWith("/editor")
            ? "overflow-hidden"
            : location.pathname.endsWith("/overview")
              ? "overflow-hidden px-12 pt-10 pb-4"
              : "overflow-y-auto px-12 pt-10 pb-4"
        }`}
      >
        <Outlet />
      </div>
    </div>
  );
};
