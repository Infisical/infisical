import { Link, Outlet, useLocation } from "@tanstack/react-router";
import { motion } from "framer-motion";

import { ProjectPermissionCan } from "@app/components/permissions";
import { Tab, TabList, Tabs } from "@app/components/v2";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useProject,
  useProjectPermission
} from "@app/context";

import { AssumePrivilegeModeBanner } from "../ProjectLayout/components/AssumePrivilegeModeBanner";

export const SshLayout = () => {
  const { currentProject } = useProject();
  const { assumedPrivilegeDetails } = useProjectPermission();
  const location = useLocation();

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
                  to="/projects/ssh/$projectId/overview"
                  params={{
                    projectId: currentProject.id
                  }}
                >
                  {({ isActive }) => (
                    <Tab
                      value={
                        isActive || location.pathname.match(/\/ssh-host-groups\//) ? "selected" : ""
                      }
                    >
                      Hosts
                    </Tab>
                  )}
                </Link>
                <ProjectPermissionCan
                  I={ProjectPermissionActions.Read}
                  a={ProjectPermissionSub.SshCertificateAuthorities}
                >
                  {(isAllowed) =>
                    isAllowed && (
                      <Link
                        to="/projects/ssh/$projectId/cas"
                        params={{
                          projectId: currentProject.id
                        }}
                      >
                        {({ isActive }) => (
                          <Tab
                            value={isActive || location.pathname.match(/\/ca\//) ? "selected" : ""}
                          >
                            Certificate Authorities
                          </Tab>
                        )}
                      </Link>
                    )
                  }
                </ProjectPermissionCan>
                <Link
                  to="/projects/ssh/$projectId/access-management"
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
                  to="/projects/ssh/$projectId/audit-logs"
                  params={{
                    projectId: currentProject.id
                  }}
                >
                  {({ isActive }) => <Tab value={isActive ? "selected" : ""}>Audit Logs</Tab>}
                </Link>
                <Link
                  to="/projects/ssh/$projectId/settings"
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
