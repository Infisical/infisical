import { Link, Outlet } from "@tanstack/react-router";
import { motion } from "framer-motion";

import { Badge, Menu, MenuItem } from "@app/components/v2";
import {
  ProjectPermissionSub,
  useProjectPermission,
  useSubscription,
  useWorkspace
} from "@app/context";
import { ProjectPermissionSecretScanningFindingActions } from "@app/context/ProjectPermissionContext/types";
import { useGetSecretScanningUnresolvedFindingCount } from "@app/hooks/api/secretScanningV2";

export const SecretScanningLayout = () => {
  const { currentWorkspace } = useWorkspace();

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
            <div className="border-b border-mineshaft-600 px-4 py-3.5 text-lg text-white">
              Secret Scanning
            </div>
            <div className="flex-1">
              <Menu>
                <Link
                  to="/projects/$projectId/secret-scanning/data-sources"
                  params={{
                    projectId: currentWorkspace.id
                  }}
                >
                  {({ isActive }) => <MenuItem isSelected={isActive}> Data Sources</MenuItem>}
                </Link>
                <Link
                  to="/projects/$projectId/secret-scanning/findings"
                  params={{
                    projectId: currentWorkspace.id
                  }}
                >
                  {({ isActive }) => (
                    <MenuItem isSelected={isActive}>
                      <div className="flex w-full items-center justify-between">
                        <span>Findings</span>
                        {Boolean(unresolvedFindings) && (
                          <Badge variant="primary" className="mr-2">
                            {unresolvedFindings}
                          </Badge>
                        )}
                      </div>
                    </MenuItem>
                  )}
                </Link>
                <Link
                  to="/projects/$projectId/secret-scanning/settings"
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
        <div className="flex-1 overflow-y-auto overflow-x-hidden bg-bunker-800 p-4 pt-8">
          <Outlet />
        </div>
      </div>
    </div>
  );
};
