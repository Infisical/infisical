import { Link, Outlet } from "@tanstack/react-router";
import { motion } from "framer-motion";

import { Menu, MenuItem } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useWorkspace } from "@app/context";
import { ProjectPermissionCan } from "@app/components/permissions";

export const SshLayout = () => {
  const { currentWorkspace } = useWorkspace();

  return (
    <div className="dark hidden h-full w-full flex-col overflow-x-hidden md:flex">
      <div className="flex flex-grow flex-col overflow-y-hidden md:flex-row">
        <motion.div
          key="menu-project-items"
          initial={{ x: -150 }}
          animate={{ x: 0 }}
          exit={{ x: -150 }}
          transition={{ duration: 0.2 }}
          className="dark w-full border-r border-mineshaft-600 bg-gradient-to-tr from-mineshaft-700 via-mineshaft-800 to-mineshaft-900 md:w-60"
        >
          <nav className="items-between flex h-full flex-col overflow-y-auto dark:[color-scheme:dark]">
            <div className="border-b border-mineshaft-600 px-4 pb-2 pt-3 text-lg text-white">
              SSH
            </div>
            <div className="mt-2 flex-grow">
              <Menu>
                <Link
                  to="/projects/$projectId/ssh/overview"
                  params={{
                    projectId: currentWorkspace.id
                  }}
                >
                  {({ isActive }) => <MenuItem isSelected={isActive}>Hosts</MenuItem>}
                </Link>
                <ProjectPermissionCan
                  I={ProjectPermissionActions.Read}
                  a={ProjectPermissionSub.SshCertificateAuthorities}
                >
                  {(isAllowed) =>
                    isAllowed && (
                      <Link
                        to="/projects/$projectId/ssh/cas"
                        params={{
                          projectId: currentWorkspace.id
                        }}
                      >
                        {({ isActive }) => (
                          <MenuItem isSelected={isActive}> Certificate Templates</MenuItem>
                        )}
                      </Link>
                    )
                  }
                </ProjectPermissionCan>
                <Link
                  to="/projects/$projectId/cert-manager/certificates"
                  params={{
                    projectId: currentWorkspace.id
                  }}
                >
                  {({ isActive }) => <MenuItem isSelected={isActive}> Certificates</MenuItem>}
                </Link>
                <Link
                  to="/projects/$projectId/cert-manager/certificate-authorities"
                  params={{
                    projectId: currentWorkspace.id
                  }}
                >
                  {({ isActive }) => (
                    <MenuItem isSelected={isActive}> Certificates Authorities</MenuItem>
                  )}
                </Link>
                <Link
                  to="/projects/$projectId/cert-manager/alerting"
                  params={{
                    projectId: currentWorkspace.id
                  }}
                >
                  {({ isActive }) => <MenuItem isSelected={isActive}>Alerting</MenuItem>}
                </Link>
                <Link
                  to="/projects/$projectId/cert-manager/settings"
                  params={{
                    projectId: currentWorkspace.id
                  }}
                >
                  {({ isActive }) => <MenuItem isSelected={isActive}>Settings</MenuItem>}
                </Link>
              </Menu>
            </div>
          </nav>
        </motion.div>
        <div className="flex-1 overflow-y-auto overflow-x-hidden bg-bunker-800 p-4 dark:[color-scheme:dark]">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

