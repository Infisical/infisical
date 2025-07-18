import { faCog, faUsers } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, Outlet } from "@tanstack/react-router";
import { motion } from "framer-motion";

import { Menu, MenuGroup, MenuItem } from "@app/components/v2";
import { useWorkspace } from "@app/context";

export const SecretScanningLayout = () => {
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
            <div className="border-b border-mineshaft-600 px-4 py-3.5 text-lg text-white">
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
                    {({ isActive }) => <MenuItem isSelected={isActive}> Data Sources</MenuItem>}
                  </Link>
                  <Link
                    to="/projects/secret-scanning/$projectId/findings"
                    params={{
                      projectId: currentWorkspace.id
                    }}
                  >
                    {({ isActive }) => <MenuItem isSelected={isActive}>Findings</MenuItem>}
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
                    to="/projects/secret-management/$projectId/settings"
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
          </nav>
        </motion.div>
        <div className="flex-1 overflow-y-auto overflow-x-hidden bg-bunker-800 p-4 pt-8">
          <Outlet />
        </div>
      </div>
    </div>
  );
};
