import {
  faBook,
  faCog,
  faDatabase,
  faHome,
  faMagnifyingGlass,
  faUsers
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, Outlet } from "@tanstack/react-router";
import { motion } from "framer-motion";

import { Badge, Lottie, Menu, MenuGroup, MenuItem } from "@app/components/v2";
import {
  ProjectPermissionSub,
  useProjectPermission,
  useSubscription,
  useWorkspace
} from "@app/context";
import { ProjectPermissionSecretScanningFindingActions } from "@app/context/ProjectPermissionContext/types";
import { useGetSecretScanningUnresolvedFindingCount } from "@app/hooks/api/secretScanningV2";

import { AssumePrivilegeModeBanner } from "../ProjectLayout/components/AssumePrivilegeModeBanner";

export const SecretScanningLayout = () => {
  const { currentWorkspace } = useWorkspace();
  const { assumedPrivilegeDetails } = useProjectPermission();

  const { permission } = useProjectPermission();
  const { subscription } = useSubscription();

  const { data: unresolvedFindings } = useGetSecretScanningUnresolvedFindingCount(
    currentWorkspace.id,
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
            <div className="flex items-center gap-3 border-b border-mineshaft-600 px-4 py-3.5 text-lg text-white">
              <Lottie className="inline-block h-5 w-5 shrink-0" icon="secret-scan" />
              Secret Scanning
            </div>
            <div className="flex-1">
              <Menu>
                <MenuGroup title="Resources">
                  <Link
                    to="/projects/secret-scanning/$projectId/data-sources"
                    params={{
                      projectId: currentWorkspace.id
                    }}
                  >
                    {({ isActive }) => (
                      <MenuItem isSelected={isActive}>
                        <div className="mx-1 flex gap-2">
                          <div className="w-6">
                            <FontAwesomeIcon icon={faDatabase} />
                          </div>
                          Data Sources
                        </div>
                      </MenuItem>
                    )}
                  </Link>
                  <Link
                    to="/projects/secret-scanning/$projectId/findings"
                    params={{
                      projectId: currentWorkspace.id
                    }}
                  >
                    {({ isActive }) => (
                      <MenuItem isSelected={isActive}>
                        <div className="mx-1 flex w-full gap-2">
                          <div className="w-6">
                            <FontAwesomeIcon icon={faMagnifyingGlass} />
                          </div>
                          <span>Findings</span>
                          {Boolean(unresolvedFindings) && (
                            <Badge variant="primary" className="ml-auto mr-2 h-min">
                              {unresolvedFindings}
                            </Badge>
                          )}
                        </div>
                      </MenuItem>
                    )}
                  </Link>
                </MenuGroup>
                <MenuGroup title="Others">
                  <Link
                    to="/projects/secret-scanning/$projectId/access-management"
                    params={{
                      projectId: currentWorkspace.id
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
                    to="/projects/secret-scanning/$projectId/audit-logs"
                    params={{
                      projectId: currentWorkspace.id
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
                    to="/projects/secret-scanning/$projectId/settings"
                    params={{
                      projectId: currentWorkspace.id
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
                    className="relative flex items-center gap-2 overflow-hidden text-sm text-mineshaft-400 hover:text-mineshaft-300"
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
        <div className="flex-1 overflow-y-auto overflow-x-hidden bg-bunker-800 p-4 pt-8">
          {assumedPrivilegeDetails && <AssumePrivilegeModeBanner />}
          <Outlet />
        </div>
      </div>
    </div>
  );
};
