import { useState } from "react";
import { useTranslation } from "react-i18next";
import { faMobile } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useNavigate, useRouter } from "@tanstack/react-router";

import { Mfa } from "@app/components/auth/Mfa";
import { CreateOrgModal } from "@app/components/organization/CreateOrgModal";
import SecurityClient from "@app/components/utilities/SecurityClient";
import { Menu, MenuItem } from "@app/components/v2";
import { useUser } from "@app/context";
import { usePopUp, useToggle } from "@app/hooks";
import { useSelectOrganization, workspaceKeys } from "@app/hooks/api";
import { authKeys } from "@app/hooks/api/auth/queries";
import { MfaMethod } from "@app/hooks/api/auth/types";
import { ProjectType } from "@app/hooks/api/workspace/types";
import { navigateUserToOrg } from "@app/pages/auth/LoginPage/Login.utils";

import { InsecureConnectionBanner } from "./components/InsecureConnectionBanner";
import { SidebarFooter } from "./components/SidebarFooter";
import { SidebarHeader } from "./components/SidebarHeader";

export const OrganizationLayout = () => {
  const [shouldShowMfa, toggleShowMfa] = useToggle(false);
  const [requiredMfaMethod, setRequiredMfaMethod] = useState(MfaMethod.EMAIL);
  const [mfaSuccessCallback, setMfaSuccessCallback] = useState<() => void>(() => {});

  const { user } = useUser();

  const { popUp, handlePopUpToggle } = usePopUp(["createOrg"] as const);
  const { mutateAsync: selectOrganization } = useSelectOrganization();
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { t } = useTranslation();
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

  return (
    <>
      <div className="dark hidden h-screen w-full flex-col overflow-x-hidden md:flex">
        {!window.isSecureContext && <InsecureConnectionBanner />}
        <div className="flex flex-grow flex-col overflow-y-hidden md:flex-row">
          <aside className="dark w-full border-r border-mineshaft-600 bg-gradient-to-tr from-mineshaft-700 via-mineshaft-800 to-mineshaft-900 md:w-60">
            <nav className="items-between flex h-full flex-col justify-between overflow-y-auto dark:[color-scheme:dark]">
              <div>
                <SidebarHeader onChangeOrg={handleOrgChange} />
                <div className="px-1">
                  <Menu className="mt-4">
                    <Link to={`/organization/${ProjectType.SecretManager}/overview` as const}>
                      {({ isActive }) => (
                        <MenuItem isSelected={isActive} icon="sliding-carousel">
                          Secret Management
                        </MenuItem>
                      )}
                    </Link>
                    <Link to={`/organization/${ProjectType.CertificateManager}/overview` as const}>
                      {({ isActive }) => (
                        <MenuItem isSelected={isActive} icon="note">
                          Cert Management
                        </MenuItem>
                      )}
                    </Link>
                    <Link to={`/organization/${ProjectType.KMS}/overview` as const}>
                      {({ isActive }) => (
                        <MenuItem isSelected={isActive} icon="unlock">
                          Key Management
                        </MenuItem>
                      )}
                    </Link>
                    <Link to={`/organization/${ProjectType.SSH}/overview` as const}>
                      {({ isActive }) => (
                        <MenuItem isSelected={isActive} icon="verified">
                          SSH
                        </MenuItem>
                      )}
                    </Link>
                    <Link to="/organization/access-management">
                      {({ isActive }) => (
                        <MenuItem isSelected={isActive} icon="groups">
                          Access Control
                        </MenuItem>
                      )}
                    </Link>
                    <Link to="/organization/secret-scanning">
                      {({ isActive }) => (
                        <MenuItem isSelected={isActive} icon="secret-scan" className="text-white">
                          Secret Scanning
                        </MenuItem>
                      )}
                    </Link>
                    <Link to="/organization/secret-sharing">
                      {({ isActive }) => (
                        <MenuItem isSelected={isActive} icon="lock-closed">
                          Secret Sharing
                        </MenuItem>
                      )}
                    </Link>
                    {(window.location.origin.includes("https://app.infisical.com") ||
                      window.location.origin.includes("https://eu.infisical.com") ||
                      window.location.origin.includes("https://gamma.infisical.com")) && (
                      <Link to="/organization/billing">
                        {({ isActive }) => (
                          <MenuItem isSelected={isActive} icon="spinning-coin">
                            Usage & Billing
                          </MenuItem>
                        )}
                      </Link>
                    )}
                    <Link to="/organization/audit-logs">
                      {({ isActive }) => (
                        <MenuItem isSelected={isActive} icon="moving-block">
                          Audit Logs
                        </MenuItem>
                      )}
                    </Link>
                    <Link to="/organization/settings">
                      {({ isActive }) => (
                        <MenuItem isSelected={isActive} icon="toggle-settings">
                          Organization Settings
                        </MenuItem>
                      )}
                    </Link>
                  </Menu>
                </div>
              </div>
              <SidebarFooter />
            </nav>
          </aside>
          <CreateOrgModal
            isOpen={popUp?.createOrg?.isOpen}
            onClose={() => handlePopUpToggle("createOrg", false)}
          />
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
