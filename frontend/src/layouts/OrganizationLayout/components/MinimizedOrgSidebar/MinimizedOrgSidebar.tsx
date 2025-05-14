import { useState } from "react";
import { faGithub, faSlack } from "@fortawesome/free-brands-svg-icons";
import {
  faArrowUpRightFromSquare,
  faBook,
  faCheck,
  faCheckCircle,
  faCog,
  faDoorClosed,
  faEnvelope,
  faInfinity,
  faInfo,
  faInfoCircle,
  faMoneyBill,
  faPlug,
  faSignOut,
  faUser,
  faUserCog,
  faUsers
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQueryClient } from "@tanstack/react-query";
import { Link, linkOptions, useLocation, useNavigate, useRouter } from "@tanstack/react-router";

import { Mfa } from "@app/components/auth/Mfa";
import { CreateOrgModal } from "@app/components/organization/CreateOrgModal";
import SecurityClient from "@app/components/utilities/SecurityClient";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Modal,
  ModalContent,
  Tooltip
} from "@app/components/v2";
import { envConfig } from "@app/config/env";
import { useOrganization, useSubscription, useUser } from "@app/context";
import { isInfisicalCloud } from "@app/helpers/platform";
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
import { SubscriptionPlan } from "@app/hooks/api/types";
import { AuthMethod } from "@app/hooks/api/users/types";
import { ProjectType } from "@app/hooks/api/workspace/types";
import { navigateUserToOrg } from "@app/pages/auth/LoginPage/Login.utils";

import { MenuIconButton } from "../MenuIconButton";
import { ServerAdminsPanel } from "../ServerAdminsPanel/ServerAdminsPanel";

const getPlan = (subscription: SubscriptionPlan) => {
  if (subscription.groups) return "Enterprise Plan";
  if (subscription.pitRecovery) return "Pro Plan";
  return "Free Plan";
};

export const INFISICAL_SUPPORT_OPTIONS = [
  [
    <FontAwesomeIcon key={1} className="pr-4 text-sm" icon={faSlack} />,
    "Support Forum",
    "https://infisical.com/slack"
  ],
  [
    <FontAwesomeIcon key={2} className="pr-4 text-sm" icon={faBook} />,
    "Read Docs",
    "https://infisical.com/docs/documentation/getting-started/introduction"
  ],
  [
    <FontAwesomeIcon key={3} className="pr-4 text-sm" icon={faGithub} />,
    "GitHub Issues",
    "https://github.com/Infisical/infisical/issues"
  ],
  [
    <FontAwesomeIcon key={4} className="pr-4 text-sm" icon={faEnvelope} />,
    "Email Support",
    "mailto:support@infisical.com"
  ],
  [
    <FontAwesomeIcon key={5} className="pr-4 text-sm" icon={faUsers} />,
    "Instance Admins",
    "server-admins"
  ]
];

export const MinimizedOrgSidebar = () => {
  const [shouldShowMfa, toggleShowMfa] = useToggle(false);
  const [requiredMfaMethod, setRequiredMfaMethod] = useState(MfaMethod.EMAIL);
  const [mfaSuccessCallback, setMfaSuccessCallback] = useState<() => void>(() => {});
  const { subscription } = useSubscription();
  const [open, setOpen] = useState(false);
  const [openSupport, setOpenSupport] = useState(false);
  const [openUser, setOpenUser] = useState(false);
  const [openOrg, setOpenOrg] = useState(false);
  const [showAdminsModal, setShowAdminsModal] = useState(false);

  const { user } = useUser();
  const { mutateAsync } = useGetOrgTrialUrl();

  const { currentOrg } = useOrganization();
  const { data: orgs } = useGetOrganizations();

  const { popUp, handlePopUpToggle } = usePopUp(["createOrg"] as const);
  const { mutateAsync: selectOrganization } = useSelectOrganization();
  const navigate = useNavigate();
  const router = useRouter();
  const location = useLocation();
  const queryClient = useQueryClient();

  const isMoreSelected = (
    [
      linkOptions({ to: "/organization/access-management" }).to,
      linkOptions({ to: "/organization/app-connections" }).to,
      linkOptions({ to: "/organization/billing" }).to,
      linkOptions({ to: "/organization/sso" }).to,
      linkOptions({ to: "/organization/gateways" }).to,
      linkOptions({ to: "/organization/settings" }).to,
      linkOptions({ to: "/organization/audit-logs" }).to
    ] as string[]
  ).includes(location.pathname);

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
      <aside
        className="dark z-10 border-r border-mineshaft-600 bg-gradient-to-tr from-mineshaft-700 via-mineshaft-800 to-mineshaft-900 transition-all duration-150"
        style={{ width: "72px" }}
      >
        <nav className="items-between flex h-full flex-col justify-between overflow-y-auto dark:[color-scheme:dark]">
          <div>
            <div className="flex items-center hover:bg-mineshaft-700">
              <DropdownMenu open={openOrg} onOpenChange={setOpenOrg} modal={false}>
                <DropdownMenuTrigger
                  onMouseEnter={() => setOpenOrg(true)}
                  onMouseLeave={() => setOpenOrg(false)}
                  asChild
                >
                  <div className="flex w-full items-center justify-center rounded-md border border-none border-mineshaft-600 p-3 pb-5 pt-6 transition-all">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
                      {currentOrg?.name.charAt(0)}
                    </div>
                  </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  onMouseEnter={() => setOpenOrg(true)}
                  onMouseLeave={() => setOpenOrg(false)}
                  align="start"
                  side="right"
                  className="mt-6 cursor-default p-1 shadow-mineshaft-600 drop-shadow-md"
                  style={{ minWidth: "220px" }}
                >
                  <div className="px-0.5 py-1">
                    <div className="flex w-full items-center justify-center rounded-md border border-mineshaft-600 bg-gradient-to-tr from-primary-500/5 to-mineshaft-800 p-1 transition-all duration-300">
                      <div className="mr-2 flex h-8 w-8 items-center justify-center rounded-md bg-primary text-black">
                        {currentOrg?.name.charAt(0)}
                      </div>
                      <div className="flex flex-grow flex-col text-white">
                        <div className="max-w-36 truncate text-ellipsis text-sm font-medium capitalize">
                          {currentOrg?.name}
                        </div>
                        <div className="text-xs text-mineshaft-400">{getPlan(subscription)}</div>
                      </div>
                    </div>
                  </div>
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
                  <DropdownMenuItem
                    icon={<FontAwesomeIcon icon={faSignOut} />}
                    onClick={logOutUser}
                  >
                    Log Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="space-y-1">
              <Link to="/organization/secret-manager/overview">
                {({ isActive }) => (
                  <MenuIconButton
                    isSelected={
                      isActive ||
                      window.location.pathname.startsWith(
                        `/organization/${ProjectType.SecretManager}`
                      )
                    }
                    icon="sliding-carousel"
                  >
                    Secrets
                  </MenuIconButton>
                )}
              </Link>
              <Link to="/organization/cert-manager/overview">
                {({ isActive }) => (
                  <MenuIconButton
                    isSelected={
                      isActive ||
                      window.location.pathname.startsWith(
                        `/organization/${ProjectType.CertificateManager}`
                      )
                    }
                    icon="note"
                  >
                    PKI
                  </MenuIconButton>
                )}
              </Link>
              <Link to="/organization/kms/overview">
                {({ isActive }) => (
                  <MenuIconButton
                    isSelected={
                      isActive ||
                      window.location.pathname.startsWith(`/organization/${ProjectType.KMS}`)
                    }
                    icon="unlock"
                  >
                    KMS
                  </MenuIconButton>
                )}
              </Link>
              <Link to="/organization/ssh/overview">
                {({ isActive }) => (
                  <MenuIconButton
                    isSelected={
                      isActive ||
                      window.location.pathname.startsWith(`/organization/${ProjectType.SSH}`)
                    }
                    icon="verified"
                  >
                    SSH
                  </MenuIconButton>
                )}
              </Link>
              <div className="w-full bg-mineshaft-500" style={{ height: "1px" }} />
              <Link to="/organization/secret-scanning">
                {({ isActive }) => (
                  <MenuIconButton isSelected={isActive} icon="secret-scan">
                    Scanner
                  </MenuIconButton>
                )}
              </Link>
              <Link to="/organization/secret-sharing">
                {({ isActive }) => (
                  <MenuIconButton isSelected={isActive} icon="lock-closed">
                    Share
                  </MenuIconButton>
                )}
              </Link>
              <div className="my-1 w-full bg-mineshaft-500" style={{ height: "1px" }} />
              <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
                <DropdownMenuTrigger
                  onMouseEnter={() => setOpen(true)}
                  onMouseLeave={() => setOpen(false)}
                  asChild
                >
                  <div className="w-full">
                    <MenuIconButton
                      lottieIconMode="reverse"
                      icon="settings-cog"
                      isSelected={isMoreSelected}
                    >
                      Admin
                    </MenuIconButton>
                  </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  onMouseEnter={() => setOpen(true)}
                  onMouseLeave={() => setOpen(false)}
                  align="start"
                  side="right"
                  className="p-1"
                >
                  <DropdownMenuLabel>Organization Options</DropdownMenuLabel>
                  <Link to="/organization/access-management">
                    <DropdownMenuItem icon={<FontAwesomeIcon className="w-3" icon={faUsers} />}>
                      Access Control
                    </DropdownMenuItem>
                  </Link>
                  <Link to="/organization/app-connections">
                    <DropdownMenuItem icon={<FontAwesomeIcon className="w-3" icon={faPlug} />}>
                      App Connections
                    </DropdownMenuItem>
                  </Link>
                  <Link to="/organization/gateways">
                    <DropdownMenuItem
                      icon={<FontAwesomeIcon className="w-3" icon={faDoorClosed} />}
                    >
                      Gateways
                    </DropdownMenuItem>
                  </Link>
                  <Link to="/organization/billing">
                    <DropdownMenuItem icon={<FontAwesomeIcon className="w-3" icon={faMoneyBill} />}>
                      Usage & Billing
                    </DropdownMenuItem>
                  </Link>
                  <Link to="/organization/audit-logs">
                    <DropdownMenuItem icon={<FontAwesomeIcon className="w-3" icon={faBook} />}>
                      Audit Logs
                    </DropdownMenuItem>
                  </Link>
                  <Link to="/organization/sso">
                    <DropdownMenuItem
                      icon={<FontAwesomeIcon className="w-3" icon={faCheckCircle} />}
                    >
                      SSO Settings
                    </DropdownMenuItem>
                  </Link>
                  <Link to="/organization/settings">
                    <DropdownMenuItem icon={<FontAwesomeIcon className="w-3" icon={faCog} />}>
                      Organization Settings
                    </DropdownMenuItem>
                  </Link>
                  <DropdownMenuLabel>Admin Panels</DropdownMenuLabel>
                  {user?.superAdmin && (
                    <Link to="/admin">
                      <DropdownMenuItem icon={<FontAwesomeIcon className="w-3" icon={faUserCog} />}>
                        Server Admin Console
                      </DropdownMenuItem>
                    </Link>
                  )}
                  <Link to="/organization/admin">
                    <DropdownMenuItem icon={<FontAwesomeIcon className="w-3" icon={faCog} />}>
                      Organization Admin Console
                    </DropdownMenuItem>
                  </Link>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <div
            className={`relative mt-10 ${
              subscription && subscription.slug === "starter" && !subscription.has_used_trial
                ? "mb-2"
                : "mb-4"
            } flex w-full cursor-default flex-col items-center px-1 text-sm text-mineshaft-400`}
          >
            <DropdownMenu open={openSupport} onOpenChange={setOpenSupport} modal={false}>
              <DropdownMenuTrigger
                onMouseEnter={() => setOpenSupport(true)}
                onMouseLeave={() => setOpenSupport(false)}
                className="w-full"
              >
                <MenuIconButton>
                  <FontAwesomeIcon icon={faInfoCircle} className="mb-3 text-lg" />
                  Support
                </MenuIconButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                onMouseEnter={() => setOpenSupport(true)}
                onMouseLeave={() => setOpenSupport(false)}
                align="end"
                side="right"
                className="p-1"
              >
                {INFISICAL_SUPPORT_OPTIONS.map(([icon, text, url]) => {
                  if (url === "server-admins" && isInfisicalCloud()) {
                    return null;
                  }
                  return (
                    <DropdownMenuItem key={url as string}>
                      {url === "server-admins" ? (
                        <button
                          type="button"
                          onClick={() => setShowAdminsModal(true)}
                          className="flex w-full items-center rounded-md font-normal text-mineshaft-300 duration-200"
                        >
                          <div className="relative flex w-full cursor-pointer select-none items-center justify-start rounded-md">
                            {icon}
                            <div className="text-sm">{text}</div>
                          </div>
                        </button>
                      ) : (
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
                      )}
                    </DropdownMenuItem>
                  );
                })}
                {envConfig.PLATFORM_VERSION && (
                  <div className="mb-2 mt-2 w-full cursor-default pl-5 text-sm duration-200 hover:text-mineshaft-200">
                    <FontAwesomeIcon icon={faInfo} className="mr-4 px-[0.1rem]" />
                    Version: {envConfig.PLATFORM_VERSION}
                  </div>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            {subscription && subscription.slug === "starter" && !subscription.has_used_trial && (
              <Tooltip content="Start Free Pro Trial" side="right">
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
                  <div className="justify-left mb-1.5 mt-1.5 flex w-full flex-col items-center rounded-md p-1 text-xs text-mineshaft-300 transition-all duration-150 hover:bg-mineshaft-500 hover:text-primary-400">
                    <FontAwesomeIcon icon={faInfinity} className="py-2 text-lg text-primary" />
                    Pro Trial
                  </div>
                </button>
              </Tooltip>
            )}
            <DropdownMenu open={openUser} onOpenChange={setOpenUser} modal={false}>
              <DropdownMenuTrigger
                onMouseEnter={() => setOpenUser(true)}
                onMouseLeave={() => setOpenUser(false)}
                className="w-full"
                asChild
              >
                <div>
                  <MenuIconButton icon="user">User</MenuIconButton>
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                onMouseEnter={() => setOpenUser(true)}
                onMouseLeave={() => setOpenUser(false)}
                side="right"
                align="end"
                className="p-1"
              >
                <div className="cursor-default px-1 py-1">
                  <div className="flex w-full items-center justify-center rounded-md border border-mineshaft-600 bg-gradient-to-tr from-primary-500/10 to-mineshaft-800 p-1 px-2 transition-all duration-150">
                    <div className="p-1 pr-3">
                      <FontAwesomeIcon icon={faUser} className="text-xl text-mineshaft-400" />
                    </div>
                    <div className="flex flex-grow flex-col text-white">
                      <div className="max-w-36 truncate text-ellipsis text-sm font-medium capitalize">
                        {user?.firstName} {user?.lastName}
                      </div>
                      <div className="text-xs text-mineshaft-300">{user.email}</div>
                    </div>
                  </div>
                </div>
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
                <div className="mt-1 h-1 border-t border-mineshaft-600" />
                <DropdownMenuItem onClick={logOutUser} icon={<FontAwesomeIcon icon={faSignOut} />}>
                  Log Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </nav>
      </aside>
      <Modal isOpen={showAdminsModal} onOpenChange={setShowAdminsModal}>
        <ModalContent title="Server Administrators" subTitle="View all server administrators">
          <div className="mb-2">
            <ServerAdminsPanel />
          </div>
        </ModalContent>
      </Modal>
      <CreateOrgModal
        isOpen={popUp?.createOrg?.isOpen}
        onClose={() => handlePopUpToggle("createOrg", false)}
      />
    </>
  );
};
