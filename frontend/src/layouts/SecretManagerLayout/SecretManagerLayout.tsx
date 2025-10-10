import { useTranslation } from "react-i18next";
import {
  faArrowsSpin,
  faBook,
  faCheckToSlot,
  faCog,
  faHome,
  faMobile,
  faPlug,
  faPuzzlePiece,
  faUsers,
  faVault
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, Outlet, useLocation } from "@tanstack/react-router";
import { motion } from "framer-motion";

import { Badge, Lottie, Menu, MenuGroup, MenuItem } from "@app/components/v2";
import { useProject, useProjectPermission } from "@app/context";
import {
  useGetAccessRequestsCount,
  useGetSecretApprovalRequestCount,
  useGetSecretRotations
} from "@app/hooks/api";

import { AssumePrivilegeModeBanner } from "../ProjectLayout/components/AssumePrivilegeModeBanner";

export const SecretManagerLayout = () => {
  const { currentProject, projectId } = useProject();
  const { assumedPrivilegeDetails } = useProjectPermission();

  const { t } = useTranslation();
  const projectSlug = currentProject?.slug || "";
  const location = useLocation();

  const { data: secretApprovalReqCount } = useGetSecretApprovalRequestCount({
    projectId
  });
  const { data: accessApprovalRequestCount } = useGetAccessRequestsCount({
    projectSlug
  });

  // we only show the secret rotations v1 tab if they have existing rotations
  const { data: secretRotations } = useGetSecretRotations({
    workspaceId: projectId,
    options: {
      refetchOnMount: false
    }
  });

  const pendingRequestsCount =
    (secretApprovalReqCount?.open || 0) + (accessApprovalRequestCount?.pendingCount || 0);

  return (
    <>
      <div className="dark hidden h-full w-full flex-col overflow-x-hidden md:flex">
        <div className="flex grow flex-col overflow-y-hidden md:flex-row">
          <motion.div
            key="menu-project-items"
            initial={{ x: -150 }}
            animate={{ x: 0 }}
            exit={{ x: -150 }}
            transition={{ duration: 0.2 }}
            className="dark w-full border-r border-mineshaft-600 bg-linear-to-tr from-mineshaft-700 via-mineshaft-800 to-mineshaft-900 md:w-60"
          >
            <nav className="items-between flex h-full flex-col overflow-y-auto dark:scheme-dark">
              <div className="flex items-center gap-3 border-b border-mineshaft-600 px-4 py-3.5 text-lg text-white">
                <Lottie className="inline-block h-5 w-5 shrink-0" icon="vault" />
                Secrets Manager
              </div>
              <div className="flex-1">
                <Menu>
                  <MenuGroup title="Resources">
                    <Link
                      to="/projects/secret-management/$projectId/overview"
                      params={{
                        projectId: currentProject.id,
                        ...(currentProject.environments.length
                          ? { envSlug: currentProject.environments[0]?.slug }
                          : {})
                      }}
                    >
                      {({ isActive }) => (
                        <MenuItem
                          isSelected={
                            isActive ||
                            location.pathname.startsWith(
                              `/projects/secret-management/${currentProject.id}/overview`
                            )
                          }
                        >
                          <div className="mx-1 flex gap-2">
                            <div className="w-6">
                              <FontAwesomeIcon icon={faVault} />
                            </div>
                            Secrets
                          </div>
                        </MenuItem>
                      )}
                    </Link>
                    <Link
                      to="/projects/secret-management/$projectId/integrations"
                      params={{
                        projectId: currentProject.id
                      }}
                    >
                      {({ isActive }) => (
                        <MenuItem isSelected={isActive}>
                          <div className="mx-1 flex gap-2">
                            <div className="w-6">
                              <FontAwesomeIcon icon={faPuzzlePiece} />
                            </div>
                            Integrations
                          </div>
                        </MenuItem>
                      )}
                    </Link>
                    {Boolean(secretRotations?.length) && (
                      <Link
                        to="/projects/secret-management/$projectId/secret-rotation"
                        params={{
                          projectId: currentProject.id
                        }}
                      >
                        {({ isActive }) => (
                          <MenuItem isSelected={isActive}>
                            <div className="mx-1 flex gap-2">
                              <div className="w-6">
                                <FontAwesomeIcon icon={faArrowsSpin} />
                              </div>
                              Secret Rotations
                            </div>
                          </MenuItem>
                        )}
                      </Link>
                    )}
                    <Link
                      to="/projects/secret-management/$projectId/approval"
                      params={{
                        projectId: currentProject.id
                      }}
                    >
                      {({ isActive }) => (
                        <MenuItem isSelected={isActive}>
                          <div className="mx-1 flex gap-2">
                            <div className="w-6">
                              <FontAwesomeIcon icon={faCheckToSlot} />
                            </div>
                            Approvals
                            {Boolean(
                              secretApprovalReqCount?.open ||
                                accessApprovalRequestCount?.pendingCount
                            ) && (
                              <Badge variant="primary" className="ml-1.5">
                                {pendingRequestsCount}
                              </Badge>
                            )}
                          </div>
                        </MenuItem>
                      )}
                    </Link>
                    <Link
                      to="/projects/secret-management/$projectId/app-connections"
                      params={{
                        projectId: currentProject.id
                      }}
                    >
                      {({ isActive }) => (
                        <MenuItem isSelected={isActive}>
                          <div className="mx-1 flex gap-2">
                            <div className="w-6">
                              <FontAwesomeIcon icon={faPlug} />
                            </div>
                            App Connections
                          </div>
                        </MenuItem>
                      )}
                    </Link>
                  </MenuGroup>
                  <MenuGroup title="Others">
                    <Link
                      to="/projects/secret-management/$projectId/access-management"
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
                      to="/projects/secret-management/$projectId/audit-logs"
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
                      to="/projects/secret-management/$projectId/settings"
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
          <div className="flex-1 overflow-x-hidden overflow-y-auto bg-bunker-800 p-4 pt-8">
            {assumedPrivilegeDetails && <AssumePrivilegeModeBanner />}
            <Outlet />
          </div>
        </div>
      </div>
      <div className="z-200 flex h-screen w-screen flex-col items-center justify-center bg-bunker-800 md:hidden">
        <FontAwesomeIcon icon={faMobile} className="mb-8 text-7xl text-gray-300" />
        <p className="max-w-sm px-6 text-center text-lg text-gray-200">
          {` ${t("common.no-mobile")} `}
        </p>
      </div>
    </>
  );
};
