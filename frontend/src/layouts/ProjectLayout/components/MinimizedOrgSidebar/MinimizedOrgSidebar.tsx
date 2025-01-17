import { useState } from "react";
import {
  faArrowUpRightFromSquare,
  faBook,
  faCheck,
  faCog,
  faEllipsis,
  faInfinity,
  faInfo,
  faInfoCircle,
  faMoneyBill,
  faReply,
  faShare,
  faSignOut,
  faUsers
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { motion } from "framer-motion";

import { Mfa } from "@app/components/auth/Mfa";
import { CreateOrgModal } from "@app/components/organization/CreateOrgModal";
import SecurityClient from "@app/components/utilities/SecurityClient";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from "@app/components/v2";
import { envConfig } from "@app/config/env";
import { useOrganization, useSubscription, useUser } from "@app/context";
import { usePopUp, useToggle } from "@app/hooks";
import {
  useGetOrganizations,
  useGetOrgTrialUrl,
  useLogoutUser,
  useSelectOrganization,
  workspaceKeys
} from "@app/hooks/api";
import { authKeys } from "@app/hooks/api/auth/queries";
import { MfaMethod } from "@app/hooks/api/auth/types";
import { AuthMethod } from "@app/hooks/api/users/types";
import { ProjectType } from "@app/hooks/api/workspace/types";
import { INFISICAL_SUPPORT_OPTIONS } from "@app/layouts/OrganizationLayout/components/SidebarFooter/SidebarFooter";
import { navigateUserToOrg } from "@app/pages/auth/LoginPage/Login.utils";

import { MenuIconButton } from "../MenuIconButton";
import { ProjectSwitcher } from "./ProjectSwitcher";

export const MinimizedOrgSidebar = () => {
  const [shouldShowMfa, toggleShowMfa] = useToggle(false);
  const [requiredMfaMethod, setRequiredMfaMethod] = useState(MfaMethod.EMAIL);
  const [mfaSuccessCallback, setMfaSuccessCallback] = useState<() => void>(() => {});
  const { subscription } = useSubscription();

  const { user } = useUser();
  const { mutateAsync } = useGetOrgTrialUrl();

  const { currentOrg } = useOrganization();
  const { data: orgs } = useGetOrganizations();

  const { popUp, handlePopUpToggle } = usePopUp(["createOrg"] as const);
  const { mutateAsync: selectOrganization } = useSelectOrganization();
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();

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

  const logout = useLogoutUser();
  const logOutUser = async () => {
    try {
      console.log("Logging out...");
      await logout.mutateAsync();
      navigate({ to: "/login" });
    } catch (error) {
      console.error(error);
    }
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
      <aside className="dark w-16 border-r border-mineshaft-600 bg-gradient-to-tr from-mineshaft-700 via-mineshaft-800 to-mineshaft-900 transition-all duration-150">
        <nav className="items-between flex h-full flex-col justify-between overflow-y-auto dark:[color-scheme:dark]">
          <div>
            <div className="flex cursor-pointer items-center p-2 pt-4 hover:bg-mineshaft-700">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <div className="flex w-full items-center justify-center rounded-md border border-none border-mineshaft-600 p-1 transition-all">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
                      {currentOrg?.name.charAt(0)}
                    </div>
                  </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="p-1">
                  <div className="px-2 py-1 text-xs capitalize text-mineshaft-400">
                    organizations
                  </div>
                  {orgs?.map((org) => {
                    return (
                      <DropdownMenuItem key={org.id}>
                        <Button
                          onClick={async () => {
                            if (currentOrg?.id === org.id) return;

                            if (org.authEnforced) {
                              // org has an org-level auth method enabled (e.g. SAML)
                              // -> logout + redirect to SAML SSO

                              await logout.mutateAsync();
                              if (org.orgAuthMethod === AuthMethod.OIDC) {
                                window.open(`/api/v1/sso/oidc/login?orgSlug=${org.slug}`);
                              } else {
                                window.open(`/api/v1/sso/redirect/saml2/organizations/${org.slug}`);
                              }
                              window.close();
                              return;
                            }

                            handleOrgChange(org?.id);
                          }}
                          variant="plain"
                          colorSchema="secondary"
                          size="xs"
                          className="flex w-full items-center justify-start p-0 font-normal"
                          leftIcon={
                            currentOrg?.id === org.id && (
                              <FontAwesomeIcon icon={faCheck} className="mr-3 text-primary" />
                            )
                          }
                        >
                          <div className="flex w-full max-w-[150px] items-center justify-between truncate">
                            {org.name}
                          </div>
                        </Button>
                      </DropdownMenuItem>
                    );
                  })}
                  <div className="mt-1 h-1 border-t border-mineshaft-600" />
                  <Link to="/organization/secret-manager/overview">
                    <DropdownMenuItem icon={<FontAwesomeIcon icon={faReply} />}>
                      Home
                    </DropdownMenuItem>
                  </Link>
                  <DropdownMenuItem
                    icon={<FontAwesomeIcon icon={faSignOut} />}
                    onClick={logOutUser}
                  >
                    Log Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="px-1">
              <motion.div
                key="menu-icons"
                className="space-y-1"
                initial={{ x: 300, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -300, opacity: 0 }}
                transition={{ duration: 0.1 }}
              >
                <DropdownMenu modal>
                  <DropdownMenuTrigger>
                    <MenuIconButton
                      isSelected={window.location.pathname.startsWith(
                        `/${ProjectType.SecretManager}`
                      )}
                      icon="sliding-carousel"
                    >
                      Secret Manager
                    </MenuIconButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    side="right"
                    className="px-3 pb-2"
                    style={{ minWidth: "320px" }}
                  >
                    <ProjectSwitcher type={ProjectType.SecretManager} />
                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu modal>
                  <DropdownMenuTrigger>
                    <MenuIconButton
                      isSelected={window.location.pathname.startsWith(
                        `/${ProjectType.CertificateManager}`
                      )}
                      icon="note"
                    >
                      Cert Manager
                    </MenuIconButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    side="right"
                    className="px-3 pb-2"
                    style={{ minWidth: "320px" }}
                  >
                    <ProjectSwitcher type={ProjectType.CertificateManager} />
                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu modal>
                  <DropdownMenuTrigger className="w-full">
                    <MenuIconButton
                      isSelected={window.location.pathname.startsWith(`/${ProjectType.KMS}`)}
                      icon="unlock"
                    >
                      KMS
                    </MenuIconButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    side="right"
                    className="px-3 pb-2"
                    style={{ minWidth: "320px" }}
                  >
                    <ProjectSwitcher type={ProjectType.KMS} />
                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu modal>
                  <DropdownMenuTrigger className="w-full">
                    <MenuIconButton
                      isSelected={window.location.pathname.startsWith(`/${ProjectType.SSH}`)}
                      icon="verified"
                    >
                      SSH
                    </MenuIconButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    side="right"
                    className="px-3 pb-2"
                    style={{ minWidth: "320px" }}
                  >
                    <ProjectSwitcher type={ProjectType.SSH} />
                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <div className="w-full">
                      <MenuIconButton>
                        <div className="flex flex-col items-center justify-center">
                          <FontAwesomeIcon icon={faEllipsis} className="mb-3 text-lg" />
                          <span>More</span>
                        </div>
                      </MenuIconButton>
                    </div>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" side="right" className="p-1">
                    <DropdownMenuLabel>Organization Options</DropdownMenuLabel>
                    <Link to="/organization/access-management">
                      <DropdownMenuItem icon={<FontAwesomeIcon icon={faUsers} />}>
                        Access Control
                      </DropdownMenuItem>
                    </Link>
                    <Link to="/organization/secret-sharing">
                      <DropdownMenuItem icon={<FontAwesomeIcon icon={faShare} />}>
                        Secret Sharing
                      </DropdownMenuItem>
                    </Link>
                    {(window.location.origin.includes("https://app.infisical.com") ||
                      window.location.origin.includes("https://eu.infisical.com") ||
                      window.location.origin.includes("https://gamma.infisical.com")) && (
                      <Link to="/organization/billing">
                        <DropdownMenuItem icon={<FontAwesomeIcon icon={faMoneyBill} />}>
                          Usage & Billing
                        </DropdownMenuItem>
                      </Link>
                    )}
                    <Link to="/organization/audit-logs">
                      <DropdownMenuItem icon={<FontAwesomeIcon icon={faBook} />}>
                        Audit Logs
                      </DropdownMenuItem>
                    </Link>
                    <Link to="/organization/settings">
                      <DropdownMenuItem icon={<FontAwesomeIcon icon={faCog} />}>
                        Organization Settings
                      </DropdownMenuItem>
                    </Link>
                  </DropdownMenuContent>
                </DropdownMenu>
              </motion.div>
            </div>
          </div>
          <div
            className={`relative mt-10 ${
              subscription && subscription.slug === "starter" && !subscription.has_used_trial
                ? "mb-2"
                : "mb-4"
            } flex w-full cursor-default flex-col items-center px-1 text-sm text-mineshaft-400`}
          >
            <DropdownMenu>
              <DropdownMenuTrigger className="w-full">
                <MenuIconButton>
                  <FontAwesomeIcon icon={faInfoCircle} className="mb-3 text-lg" />
                  Support
                </MenuIconButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="p-1">
                {INFISICAL_SUPPORT_OPTIONS.map(([icon, text, url]) => (
                  <DropdownMenuItem key={url as string}>
                    <a
                      target="_blank"
                      rel="noopener noreferrer"
                      href={String(url)}
                      className="flex w-full items-center rounded-md font-normal text-mineshaft-300 duration-200"
                    >
                      <div className="relative flex w-full cursor-pointer select-none items-center justify-start rounded-md">
                        {icon}
                        <div className="text-sm">{text}</div>
                      </div>
                    </a>
                  </DropdownMenuItem>
                ))}
                {envConfig.PLATFORM_VERSION && (
                  <div className="mb-2 mt-2 w-full cursor-default pl-5 text-sm duration-200 hover:text-mineshaft-200">
                    <FontAwesomeIcon icon={faInfo} className="mr-4 px-[0.1rem]" />
                    Version: {envConfig.PLATFORM_VERSION}
                  </div>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            {subscription && subscription.slug === "starter" && !subscription.has_used_trial && (
              <button
                type="button"
                onClick={async () => {
                  if (!subscription || !currentOrg) return;

                  // direct user to start pro trial
                  const url = await mutateAsync({
                    orgId: currentOrg.id,
                    success_url: window.location.href
                  });

                  window.location.href = url;
                }}
                className="mt-1.5 w-full"
              >
                <div className="justify-left mb-1.5 mt-1.5 flex w-full items-center rounded-md bg-mineshaft-600 py-1 pl-4 text-mineshaft-300 duration-200 hover:bg-mineshaft-500 hover:text-primary-400">
                  <FontAwesomeIcon icon={faInfinity} className="ml-0.5 mr-3 py-2 text-primary" />
                  Start Free Pro Trial
                </div>
              </button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger className="w-full" asChild>
                <div>
                  <MenuIconButton>
                    <div className="my-1 flex h-6 w-6 items-center justify-center rounded-md bg-primary text-sm uppercase text-black">
                      {user?.firstName?.charAt(0)}
                    </div>
                  </MenuIconButton>
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="p-1">
                <div className="px-2 py-1 text-xs text-mineshaft-400">{user?.username}</div>
                <Link to="/personal-settings">
                  <DropdownMenuItem>Personal Settings</DropdownMenuItem>
                </Link>
                <a
                  href="https://infisical.com/docs/documentation/getting-started/introduction"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 w-full text-sm font-normal leading-[1.2rem] text-mineshaft-300 hover:text-mineshaft-100"
                >
                  <DropdownMenuItem>
                    Documentation
                    <FontAwesomeIcon
                      icon={faArrowUpRightFromSquare}
                      className="mb-[0.06rem] pl-1.5 text-xxs"
                    />
                  </DropdownMenuItem>
                </a>
                <a
                  href="https://infisical.com/slack"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 w-full text-sm font-normal leading-[1.2rem] text-mineshaft-300 hover:text-mineshaft-100"
                >
                  <DropdownMenuItem>
                    Join Slack Community
                    <FontAwesomeIcon
                      icon={faArrowUpRightFromSquare}
                      className="mb-[0.06rem] pl-1.5 text-xxs"
                    />
                  </DropdownMenuItem>
                </a>
                {user?.superAdmin && (
                  <Link to="/admin">
                    <DropdownMenuItem className="mt-1 border-t border-mineshaft-600">
                      Server Admin Console
                    </DropdownMenuItem>
                  </Link>
                )}
                <Link to="/organization/admin">
                  <DropdownMenuItem className="mt-1 border-t border-mineshaft-600">
                    Organization Admin Console
                  </DropdownMenuItem>
                </Link>
                <div className="mt-1 h-1 border-t border-mineshaft-600" />
                <DropdownMenuItem onClick={logOutUser} icon={<FontAwesomeIcon icon={faSignOut} />}>
                  Log Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </nav>
      </aside>
      <CreateOrgModal
        isOpen={popUp?.createOrg?.isOpen}
        onClose={() => handlePopUpToggle("createOrg", false)}
      />
    </>
  );
};
