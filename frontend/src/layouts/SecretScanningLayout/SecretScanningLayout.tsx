import { Link, Outlet, useLocation } from "@tanstack/react-router";
import { motion } from "framer-motion";

import { Tab, TabList, Tabs } from "@app/components/v2";
import { Badge } from "@app/components/v3";
import {
  ProjectPermissionSub,
  useProject,
  useProjectPermission,
  useSubscription
} from "@app/context";
import { ProjectPermissionSecretScanningFindingActions } from "@app/context/ProjectPermissionContext/types";
import { useGetSecretScanningUnresolvedFindingCount } from "@app/hooks/api/secretScanningV2";

import { AssumePrivilegeModeBanner } from "../ProjectLayout/components/AssumePrivilegeModeBanner";

export const SecretScanningLayout = () => {
  const { currentProject } = useProject();
  const { assumedPrivilegeDetails } = useProjectPermission();

  const { permission } = useProjectPermission();
  const { subscription } = useSubscription();
  const location = useLocation();

  const { data: unresolvedFindings } = useGetSecretScanningUnresolvedFindingCount(
    currentProject.id,
    {
      enabled:
        subscription.secretScanning &&
        permission.can(
          ProjectPermissionSecretScanningFindingActions.Read,
          ProjectPermissionSub.SecretScanningFindings
        ),
      refetchInterval: 30000
    }
  );

  return (
    <div className="dark hidden h-full w-full flex-col overflow-x-hidden md:flex">
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
                  to="/projects/secret-scanning/$projectId/data-sources"
                  params={{
                    projectId: currentProject.id
                  }}
                >
                  {({ isActive }) => <Tab value={isActive ? "selected" : ""}>Data Sources</Tab>}
                </Link>
                <Link
                  to="/projects/secret-scanning/$projectId/findings"
                  params={{
                    projectId: currentProject.id
                  }}
                >
                  {({ isActive }) => (
                    <Tab value={isActive ? "selected" : ""}>
                      Findings
                      {Boolean(unresolvedFindings) && (
                        <Badge isSquare variant="warning" className="ml-2">
                          {unresolvedFindings}
                        </Badge>
                      )}
                    </Tab>
                  )}
                </Link>
                <Link
                  to="/projects/secret-scanning/$projectId/app-connections"
                  params={{
                    projectId: currentProject.id
                  }}
                >
                  {({ isActive }) => <Tab value={isActive ? "selected" : ""}>App Connections</Tab>}
                </Link>
                <Link
                  to="/projects/secret-scanning/$projectId/access-management"
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
                  to="/projects/secret-scanning/$projectId/audit-logs"
                  params={{
                    projectId: currentProject.id
                  }}
                >
                  {({ isActive }) => <Tab value={isActive ? "selected" : ""}>Audit Logs</Tab>}
                </Link>
                <Link
                  to="/projects/secret-scanning/$projectId/settings"
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
  );
};
