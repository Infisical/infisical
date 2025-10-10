import {
  faBook,
  faCog,
  faHome,
  faServer,
  faStamp,
  faUsers
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, Outlet } from "@tanstack/react-router";
import { motion } from "framer-motion";

import { ProjectPermissionCan } from "@app/components/permissions";
import { Lottie, Menu, MenuGroup, MenuItem } from "@app/components/v2";
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

  return (
    <div className="dark hidden h-full w-full flex-col overflow-x-hidden md:flex">
      <div className="flex grow flex-col overflow-y-hidden md:flex-row">
        <motion.div
          key="menu-project-items"
          initial={{ x: -150 }}
          animate={{ x: 0 }}
          exit={{ x: -150 }}
          transition={{ duration: 0.2 }}
          className="border-mineshaft-600 bg-linear-to-tr from-mineshaft-700 via-mineshaft-800 to-mineshaft-900 dark w-full border-r md:w-60"
        >
          <nav className="items-between dark:scheme-dark flex h-full flex-col overflow-y-auto">
            <div className="border-mineshaft-600 flex items-center gap-3 border-b px-4 py-3.5 text-lg text-white">
              <Lottie className="inline-block h-5 w-5 shrink-0" icon="terminal" />
              SSH
            </div>
            <div className="flex-1">
              <Menu>
                <MenuGroup title="Resources">
                  <Link
                    to="/projects/ssh/$projectId/overview"
                    params={{
                      projectId: currentProject.id
                    }}
                  >
                    {({ isActive }) => (
                      <MenuItem isSelected={isActive}>
                        <div className="mx-1 flex gap-2">
                          <div className="w-6">
                            <FontAwesomeIcon icon={faServer} />
                          </div>
                          Hosts
                        </div>
                      </MenuItem>
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
                            <MenuItem isSelected={isActive}>
                              <div className="mx-1 flex gap-2">
                                <div className="w-6">
                                  <FontAwesomeIcon icon={faStamp} />
                                </div>
                                Certificates Authority
                              </div>
                            </MenuItem>
                          )}
                        </Link>
                      )
                    }
                  </ProjectPermissionCan>
                </MenuGroup>

                <MenuGroup title="Others">
                  <Link
                    to="/projects/ssh/$projectId/access-management"
                    params={{
                      projectId: currentProject.id
                    }}
                  >
                    {({ isActive }) => (
                      <MenuItem isSelected={isActive}>
                        <div className="mx-1 flex gap-2">
                          <div className="w-6">
                            <FontAwesomeIcon icon={faUsers} />
                          </div>
                          Access Management
                        </div>
                      </MenuItem>
                    )}
                  </Link>
                  <Link
                    to="/projects/ssh/$projectId/audit-logs"
                    params={{
                      projectId: currentProject.id
                    }}
                  >
                    {({ isActive }) => (
                      <MenuItem isSelected={isActive}>
                        <div className="mx-1 flex gap-2">
                          <div className="w-6">
                            <FontAwesomeIcon icon={faBook} />
                          </div>
                          Audit Logs
                        </div>
                      </MenuItem>
                    )}
                  </Link>
                  <Link
                    to="/projects/ssh/$projectId/settings"
                    params={{
                      projectId: currentProject.id
                    }}
                  >
                    {({ isActive }) => (
                      <MenuItem isSelected={isActive}>
                        <div className="mx-1 flex gap-2">
                          <div className="w-6">
                            <FontAwesomeIcon icon={faCog} />
                          </div>
                          Settings
                        </div>
                      </MenuItem>
                    )}
                  </Link>
                </MenuGroup>
              </Menu>
            </div>
            <div>
              <Menu>
                <Link to="/organization/projects">
                  <MenuItem
                    className="text-mineshaft-400 hover:text-mineshaft-300 relative flex items-center gap-2 overflow-hidden text-sm"
                    leftIcon={
                      <div className="w-6">
                        <FontAwesomeIcon className="mx-1 inline-block shrink-0" icon={faHome} />
                      </div>
                    }
                  >
                    Organization Home
                  </MenuItem>
                </Link>
              </Menu>
            </div>
          </nav>
        </motion.div>
        <div className="bg-bunker-800 flex-1 overflow-y-auto overflow-x-hidden p-4 pt-8">
          {assumedPrivilegeDetails && <AssumePrivilegeModeBanner />}
          <Outlet />
        </div>
      </div>
    </div>
  );
};
