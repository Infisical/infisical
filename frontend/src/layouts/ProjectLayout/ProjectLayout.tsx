import { useTranslation } from "react-i18next";
import { faMobile } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { motion } from "framer-motion";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  BreadcrumbContainer,
  Menu,
  MenuGroup,
  MenuItem,
  TBreadcrumbFormat
} from "@app/components/v2";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useProjectPermission,
  useSubscription,
  useWorkspace
} from "@app/context";
import {
  useGetAccessRequestsCount,
  useGetSecretApprovalRequestCount,
  useGetSecretRotations
} from "@app/hooks/api";
import { ProjectType } from "@app/hooks/api/workspace/types";

import { AssumePrivilegeModeBanner } from "./components/AssumePrivilegeModeBanner";
import { ProjectSelect } from "./components/ProjectSelect";

// This is a generic layout shared by all types of projects.
// If the product layout differs significantly, create a new layout as needed.
export const ProjectLayout = () => {
  const { currentWorkspace } = useWorkspace();
  const matches = useRouterState({ select: (s) => s.matches.at(-1)?.context });
  const breadcrumbs = matches && "breadcrumbs" in matches ? matches.breadcrumbs : undefined;

  const { t } = useTranslation();
  const { assumedPrivilegeDetails } = useProjectPermission();
  const workspaceId = currentWorkspace?.id || "";
  const projectSlug = currentWorkspace?.slug || "";
  const { subscription } = useSubscription();

  const isSecretManager = currentWorkspace?.type === ProjectType.SecretManager;
  const isCertManager = currentWorkspace?.type === ProjectType.CertificateManager;
  const isCmek = currentWorkspace?.type === ProjectType.KMS;
  const isSSH = currentWorkspace?.type === ProjectType.SSH;

  const { data: secretApprovalReqCount } = useGetSecretApprovalRequestCount({
    workspaceId,
    options: { enabled: isSecretManager }
  });
  const { data: accessApprovalRequestCount } = useGetAccessRequestsCount({
    projectSlug,
    options: { enabled: isSecretManager }
  });

  // we only show the secret rotations v1 tab if they have existing rotations
  const { data: secretRotations } = useGetSecretRotations({
    workspaceId,
    options: {
      enabled: isSecretManager && Boolean(subscription.secretRotation),
      refetchOnMount: false
    }
  });

  const pendingRequestsCount =
    (secretApprovalReqCount?.open || 0) + (accessApprovalRequestCount?.pendingCount || 0);

  return (
    <>
      <div className="dark hidden h-screen w-full flex-col overflow-x-hidden md:flex">
        {assumedPrivilegeDetails && <AssumePrivilegeModeBanner />}
        <div className="flex flex-grow flex-col overflow-y-hidden md:flex-row">
          <motion.div
            key="menu-project-items"
            initial={{ x: -150 }}
            animate={{ x: 0 }}
            exit={{ x: -150 }}
            transition={{ duration: 0.2 }}
            className="dark w-full border-r border-mineshaft-600 bg-gradient-to-tr from-mineshaft-700 via-mineshaft-800 to-mineshaft-900 md:w-60"
          >
            <nav className="items-between flex h-full flex-col justify-between overflow-y-auto dark:[color-scheme:dark]">
              <div>
                <ProjectSelect />
                <div className="px-1">
                  <Menu>
                    <MenuGroup title="Main Menu">
                      {isSecretManager && (
                        <Link
                          to={`/${ProjectType.SecretManager}/$projectId/overview` as const}
                          params={{
                            projectId: currentWorkspace.id
                          }}
                        >
                          {({ isActive }) => (
                            <MenuItem isSelected={isActive} icon="lock-closed">
                              {t("nav.menu.secrets")}
                            </MenuItem>
                          )}
                        </Link>
                      )}
                      {isCertManager && (
                        <>
                          <Link
                            to={`/${ProjectType.CertificateManager}/$projectId/overview` as const}
                            params={{
                              projectId: currentWorkspace.id
                            }}
                          >
                            {({ isActive }) => (
                              <MenuItem isSelected={isActive} icon="certificate">
                                Certificates
                              </MenuItem>
                            )}
                          </Link>
                          <Link
                            to={
                              `/${ProjectType.CertificateManager}/$projectId/certificate-authorities` as const
                            }
                            params={{
                              projectId: currentWorkspace.id
                            }}
                          >
                            {({ isActive }) => (
                              <MenuItem isSelected={isActive} icon="certificate-authority">
                                Certificate Authorities
                              </MenuItem>
                            )}
                          </Link>
                          <Link
                            to={`/${ProjectType.CertificateManager}/$projectId/alerting` as const}
                            params={{
                              projectId: currentWorkspace.id
                            }}
                          >
                            {({ isActive }) => (
                              <MenuItem isSelected={isActive} icon="notification-bell">
                                Alerting
                              </MenuItem>
                            )}
                          </Link>
                        </>
                      )}
                      {isCmek && (
                        <Link
                          to={`/${ProjectType.KMS}/$projectId/overview` as const}
                          params={{
                            projectId: currentWorkspace.id
                          }}
                        >
                          {({ isActive }) => (
                            <MenuItem isSelected={isActive} icon="lock-closed">
                              Overview
                            </MenuItem>
                          )}
                        </Link>
                      )}
                      {isCmek && (
                        <Link
                          to={`/${ProjectType.KMS}/$projectId/kmip` as const}
                          params={{
                            projectId: currentWorkspace.id
                          }}
                        >
                          {({ isActive }) => (
                            <MenuItem isSelected={isActive} icon="key-user" iconMode="reverse">
                              KMIP
                            </MenuItem>
                          )}
                        </Link>
                      )}
                      {isSSH && (
                        <>
                          <Link
                            to={`/${ProjectType.SSH}/$projectId/overview` as const}
                            params={{
                              projectId: currentWorkspace.id
                            }}
                          >
                            {({ isActive }) => (
                              <MenuItem isSelected={isActive} icon="server">
                                Hosts
                              </MenuItem>
                            )}
                          </Link>
                          {/* <Link
                            to={`/${ProjectType.SSH}/$projectId/certificates` as const}
                            params={{
                              projectId: currentWorkspace.id
                            }}
                          >
                            {({ isActive }) => (
                              <MenuItem isSelected={isActive} icon="certificate" iconMode="reverse">
                                Certificates
                              </MenuItem>
                            )}
                          </Link> */}
                          <ProjectPermissionCan
                            I={ProjectPermissionActions.Read}
                            a={ProjectPermissionSub.SshCertificateAuthorities}
                          >
                            {(isAllowed) =>
                              isAllowed && (
                                <Link
                                  to={`/${ProjectType.SSH}/$projectId/cas` as const}
                                  params={{
                                    projectId: currentWorkspace.id
                                  }}
                                >
                                  {({ isActive }) => (
                                    <MenuItem
                                      isSelected={isActive}
                                      icon="certificate-authority"
                                      iconMode="reverse"
                                    >
                                      Certificate Authorities
                                    </MenuItem>
                                  )}
                                </Link>
                              )
                            }
                          </ProjectPermissionCan>
                        </>
                      )}
                      {isSecretManager && (
                        <Link
                          to={`/${ProjectType.SecretManager}/$projectId/integrations` as const}
                          params={{
                            projectId: currentWorkspace.id
                          }}
                        >
                          {({ isActive }) => (
                            <MenuItem isSelected={isActive} icon="jigsaw-puzzle">
                              {t("nav.menu.integrations")}
                            </MenuItem>
                          )}
                        </Link>
                      )}
                      {isSecretManager && Boolean(secretRotations?.length) && (
                        <Link
                          to={`/${ProjectType.SecretManager}/$projectId/secret-rotation` as const}
                          params={{
                            projectId: currentWorkspace.id
                          }}
                        >
                          {({ isActive }) => (
                            <MenuItem isSelected={isActive} icon="rotation">
                              Secret Rotation
                            </MenuItem>
                          )}
                        </Link>
                      )}
                      {isSecretManager && (
                        <Link
                          to={`/${ProjectType.SecretManager}/$projectId/approval` as const}
                          params={{
                            projectId: currentWorkspace.id
                          }}
                        >
                          {({ isActive }) => (
                            <MenuItem isSelected={isActive} icon="circular-check">
                              Approvals
                              {Boolean(
                                secretApprovalReqCount?.open ||
                                  accessApprovalRequestCount?.pendingCount
                              ) && (
                                <span className="ml-2 rounded border border-primary-400 bg-primary-600 px-1 py-0.5 text-xs font-semibold text-black">
                                  {pendingRequestsCount}
                                </span>
                              )}
                            </MenuItem>
                          )}
                        </Link>
                      )}
                    </MenuGroup>
                    <MenuGroup title="Other">
                      <Link
                        to={`/${currentWorkspace.type}/$projectId/access-management` as const}
                        params={{
                          projectId: currentWorkspace.id
                        }}
                      >
                        {({ isActive }) => (
                          <MenuItem isSelected={isActive} icon="groups">
                            Access Control
                          </MenuItem>
                        )}
                      </Link>
                      <Link
                        to={`/${currentWorkspace.type}/$projectId/settings` as const}
                        params={{
                          projectId: currentWorkspace.id
                        }}
                      >
                        {({ isActive }) => (
                          <MenuItem isSelected={isActive} icon="toggle-settings">
                            {t("nav.menu.project-settings")}
                          </MenuItem>
                        )}
                      </Link>
                    </MenuGroup>
                  </Menu>
                </div>
              </div>
            </nav>
          </motion.div>
          <div className="flex-1 overflow-y-auto overflow-x-hidden bg-bunker-800 px-4 pb-4 dark:[color-scheme:dark]">
            {breadcrumbs ? (
              <BreadcrumbContainer breadcrumbs={breadcrumbs as TBreadcrumbFormat[]} />
            ) : null}
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
