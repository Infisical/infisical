import { useTranslation } from "react-i18next";
import { faMobile } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, Outlet } from "@tanstack/react-router";
import { motion } from "framer-motion";

import { Badge, Menu, MenuItem } from "@app/components/v2";
import { useWorkspace } from "@app/context";
import {
  useGetAccessRequestsCount,
  useGetSecretApprovalRequestCount,
  useGetSecretRotations
} from "@app/hooks/api";

export const SecretManagerLayout = () => {
  const { currentWorkspace } = useWorkspace();

  const { t } = useTranslation();
  const workspaceId = currentWorkspace?.id || "";
  const projectSlug = currentWorkspace?.slug || "";

  const { data: secretApprovalReqCount } = useGetSecretApprovalRequestCount({
    workspaceId
  });
  const { data: accessApprovalRequestCount } = useGetAccessRequestsCount({
    projectSlug
  });

  // we only show the secret rotations v1 tab if they have existing rotations
  const { data: secretRotations } = useGetSecretRotations({
    workspaceId,
    options: {
      refetchOnMount: false
    }
  });

  const pendingRequestsCount =
    (secretApprovalReqCount?.open || 0) + (accessApprovalRequestCount?.pendingCount || 0);

  return (
    <>
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
                Secrets Manager
              </div>
              <div className="flex-1">
                <Menu>
                  <Link
                    to="/projects/$projectId/secret-manager/overview"
                    params={{
                      projectId: currentWorkspace.id
                    }}
                  >
                    {({ isActive }) => (
                      <MenuItem isSelected={isActive}>{t("nav.menu.secrets")}</MenuItem>
                    )}
                  </Link>
                  <Link
                    to="/projects/$projectId/secret-manager/integrations"
                    params={{
                      projectId: currentWorkspace.id
                    }}
                  >
                    {({ isActive }) => (
                      <MenuItem isSelected={isActive}>{t("nav.menu.integrations")}</MenuItem>
                    )}
                  </Link>
                  {Boolean(secretRotations?.length) && (
                    <Link
                      to="/projects/$projectId/secret-manager/secret-rotation"
                      params={{
                        projectId: currentWorkspace.id
                      }}
                    >
                      {({ isActive }) => <MenuItem isSelected={isActive}>Secret Rotation</MenuItem>}
                    </Link>
                  )}
                  <Link
                    to="/projects/$projectId/secret-manager/approval"
                    params={{
                      projectId: currentWorkspace.id
                    }}
                  >
                    {({ isActive }) => (
                      <MenuItem isSelected={isActive}>
                        Approvals
                        {Boolean(
                          secretApprovalReqCount?.open || accessApprovalRequestCount?.pendingCount
                        ) && (
                          <Badge variant="primary" className="ml-1.5">
                            {pendingRequestsCount}
                          </Badge>
                        )}
                      </MenuItem>
                    )}
                  </Link>
                  <Link
                    to="/projects/$projectId/secret-manager/settings"
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
      <div className="z-[200] flex h-screen w-screen flex-col items-center justify-center bg-bunker-800 md:hidden">
        <FontAwesomeIcon icon={faMobile} className="mb-8 text-7xl text-gray-300" />
        <p className="max-w-sm px-6 text-center text-lg text-gray-200">
          {` ${t("common.no-mobile")} `}
        </p>
      </div>
    </>
  );
};
