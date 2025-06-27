import { Link, Outlet } from "@tanstack/react-router";
import { motion } from "framer-motion";

import { Menu, MenuItem } from "@app/components/v2";
import { useWorkspace } from "@app/context";

export const ProjectGeneralLayout = () => {
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
              Project Overview
            </div>
            <div className="flex-1">
              <Menu>
                <Link
                  to="/projects/$projectId/access-management"
                  params={{
                    projectId: currentWorkspace.id
                  }}
                >
                  {({ isActive }) => <MenuItem isSelected={isActive}>Access Control</MenuItem>}
                </Link>
                <Link
                  to="/projects/$projectId/settings"
                  params={{
                    projectId: currentWorkspace.id
                  }}
                >
                  {({ isActive }) => <MenuItem isSelected={isActive}>Project Settings</MenuItem>}
                </Link>
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
