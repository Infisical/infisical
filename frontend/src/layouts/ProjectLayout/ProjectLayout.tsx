import { useState } from "react";
import { useTranslation } from "react-i18next";
import { faMobile } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useNavigate, useRouter } from "@tanstack/react-router";

import { Mfa } from "@app/components/auth/Mfa";
import SecurityClient from "@app/components/utilities/SecurityClient";
import { Menu, MenuItem } from "@app/components/v2";
import { useUser, useWorkspace } from "@app/context";
import { useToggle } from "@app/hooks";
import {
  useGetAccessRequestsCount,
  useGetSecretApprovalRequestCount,
  useSelectOrganization,
  workspaceKeys
} from "@app/hooks/api";
import { authKeys } from "@app/hooks/api/auth/queries";
import { MfaMethod } from "@app/hooks/api/auth/types";
import { ProjectType } from "@app/hooks/api/workspace/types";
import { navigateUserToOrg } from "@app/pages/auth/LoginPage/Login.utils";

import { InsecureConnectionBanner } from "../OrganizationLayout/components/InsecureConnectionBanner";
import { SidebarFooter } from "../OrganizationLayout/components/SidebarFooter";
import { ProjectSelect } from "./components/ProjectSelect";
import { SidebarHeader } from "./components/SidebarHeader";

// This is a generic layout shared by all types of projects.
// If the product layout differs significantly, create a new layout as needed.
export const ProjectLayout = () => {
  const { currentWorkspace } = useWorkspace();
  const navigate = useNavigate();

  const [shouldShowMfa, toggleShowMfa] = useToggle(false);
  const [requiredMfaMethod, setRequiredMfaMethod] = useState(MfaMethod.EMAIL);
  const [mfaSuccessCallback, setMfaSuccessCallback] = useState<() => void>(() => {});

  const { user } = useUser();

  const { mutateAsync: selectOrganization } = useSelectOrganization();

  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const workspaceId = currentWorkspace?.id || "";
  const projectSlug = currentWorkspace?.slug || "";

  const { data: secretApprovalReqCount } = useGetSecretApprovalRequestCount({ workspaceId });
  const { data: accessApprovalRequestCount } = useGetAccessRequestsCount({ projectSlug });

  const pendingRequestsCount =
    (secretApprovalReqCount?.open || 0) + (accessApprovalRequestCount?.pendingCount || 0);

  const handleOrgChange = async (orgId: string) => {
    queryClient.removeQueries({ queryKey: authKeys.getAuthToken });
    queryClient.removeQueries({ queryKey: workspaceKeys.getAllUserWorkspace() });

    const { token, isMfaEnabled, mfaMethod } = await selectOrganization({
      organizationId: orgId
    });

    if (isMfaEnabled) {
      SecurityClient.setMfaToken(token);
      if (mfaMethod) {
        setRequiredMfaMethod(mfaMethod);
      }
      toggleShowMfa.on();
      setMfaSuccessCallback(() => () => handleOrgChange(orgId));
      return;
    }
    await router.invalidate();
    await navigateUserToOrg(navigate, orgId);
  };

  if (shouldShowMfa) {
    return (
      <div className="flex max-h-screen min-h-screen flex-col items-center justify-center gap-2 overflow-y-auto bg-gradient-to-tr from-mineshaft-600 via-mineshaft-800 to-bunker-700">
        <Mfa
          email={user.email as string}
          method={requiredMfaMethod}
          successCallback={mfaSuccessCallback}
          closeMfa={() => toggleShowMfa.off()}
        />
      </div>
    );
  }

  const isSecretManager = currentWorkspace?.type === ProjectType.SecretManager;
  const isCertManager = currentWorkspace?.type === ProjectType.CertificateManager;
  const isCmek = currentWorkspace?.type === ProjectType.KMS;
  const isSSH = currentWorkspace?.type === ProjectType.SSH;

  return (
    <>
      <div className="dark hidden h-screen w-full flex-col overflow-x-hidden md:flex">
        {!window.isSecureContext && <InsecureConnectionBanner />}
        <div className="flex flex-grow flex-col overflow-y-hidden md:flex-row">
          <aside className="dark w-full border-r border-mineshaft-600 bg-gradient-to-tr from-mineshaft-700 via-mineshaft-800 to-mineshaft-900 md:w-60">
            <nav className="items-between flex h-full flex-col justify-between overflow-y-auto dark:[color-scheme:dark]">
              <div>
                <SidebarHeader onChangeOrg={handleOrgChange} />
                <ProjectSelect />
                <div className="px-1">
                  <Menu>
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
                      <Link
                        to={`/${ProjectType.CertificateManager}/$projectId/overview` as const}
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
                    {isSSH && (
                      <Link
                        to={`/${ProjectType.SSH}/$projectId/overview` as const}
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
                    {isSecretManager && (
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
                  </Menu>
                </div>
              </div>
              <SidebarFooter />
            </nav>
          </aside>
          <main className="flex-1 overflow-y-auto overflow-x-hidden bg-bunker-800 dark:[color-scheme:dark]">
            <Outlet />
          </main>
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
