import { useState } from "react";
import { useTranslation } from "react-i18next";
import { faGithub, faSlack } from "@fortawesome/free-brands-svg-icons";
import {
  faAngleDown,
  faArrowUpRightFromSquare,
  faBook,
  faCheck,
  faEnvelope,
  faInfinity,
  faInfo,
  faMobile,
  faPlus,
  faQuestion
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { DropdownMenuTrigger } from "@radix-ui/react-dropdown-menu";

import SecurityClient from "@app/components/utilities/SecurityClient";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  Menu,
  MenuItem
} from "@app/components/v2";
import { useOrganization, useSubscription, useUser } from "@app/context";
import { usePopUp, useToggle } from "@app/hooks";
import {
  useGetOrganizations,
  useGetOrgTrialUrl,
  useLogoutUser,
  useSelectOrganization
} from "@app/hooks/api";
import { MfaMethod } from "@app/hooks/api/auth/types";
import { AuthMethod } from "@app/hooks/api/users/types";
import { ProjectType } from "@app/hooks/api/workspace/types";
import { InsecureConnectionBanner } from "./components/InsecureConnectionBanner";
// import { navigateUserToOrg } from "@app/views/Login/Login.utils";
// import { CreateOrgModal } from "@app/views/Org/components";

import { WishForm } from "@app/components/features/WishForm";
import { Mfa } from "@app/components/auth/Mfa";
import { Link, Outlet, useNavigate } from "@tanstack/react-router";

const supportOptions = [
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
  ]
];

export const OrganizationLayout = () => {
  const navigate = useNavigate();

  const { mutateAsync } = useGetOrgTrialUrl();

  const { currentOrg } = useOrganization();
  const { data: orgs } = useGetOrganizations();

  const [shouldShowMfa, toggleShowMfa] = useToggle(false);
  const [requiredMfaMethod, setRequiredMfaMethod] = useState(MfaMethod.EMAIL);
  const [mfaSuccessCallback, setMfaSuccessCallback] = useState<() => void>(() => {});

  const { user } = useUser();
  const { subscription } = useSubscription();

  const infisicalPlatformVersion = process.env.NEXT_PUBLIC_INFISICAL_PLATFORM_VERSION;

  const { popUp, handlePopUpToggle } = usePopUp(["createOrg"] as const);

  const { t } = useTranslation();

  const { mutateAsync: selectOrganization } = useSelectOrganization();

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

  const changeOrg = async (orgId: string) => {
    const { token, isMfaEnabled, mfaMethod } = await selectOrganization({
      organizationId: orgId
    });

    if (isMfaEnabled) {
      SecurityClient.setMfaToken(token);
      if (mfaMethod) {
        setRequiredMfaMethod(mfaMethod);
      }
      toggleShowMfa.on();
      setMfaSuccessCallback(() => () => changeOrg(orgId));
      return;
    }

    // await navigateUserToOrg(router, orgId);
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
                <div className="flex h-12 cursor-default items-center px-3 pt-6">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      asChild
                      className="max-w-[160px] data-[state=open]:bg-mineshaft-600"
                    >
                      <div className="mr-auto flex items-center rounded-md py-1.5 pl-1.5 pr-2 hover:bg-mineshaft-600">
                        <div className="flex h-5 w-5 min-w-[20px] items-center justify-center rounded-md bg-primary text-sm">
                          {currentOrg?.name.charAt(0)}
                        </div>
                        <div
                          className="overflow-hidden truncate text-ellipsis pl-2 text-sm text-mineshaft-100"
                          style={{ maxWidth: "140px" }}
                        >
                          {currentOrg?.name}
                        </div>
                        <FontAwesomeIcon
                          icon={faAngleDown}
                          className="pl-1 pt-1 text-xs text-mineshaft-300"
                        />
                      </div>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="p-1">
                      <div className="px-2 py-1 text-xs text-mineshaft-400">{user?.username}</div>
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
                                    window.open(
                                      `/api/v1/sso/redirect/saml2/organizations/${org.slug}`
                                    );
                                  }
                                  window.close();
                                  return;
                                }

                                changeOrg(org?.id);
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
                      <button type="button" onClick={logOutUser} className="w-full">
                        <DropdownMenuItem>Log Out</DropdownMenuItem>
                      </button>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      asChild
                      className="p-1 hover:bg-primary-400 hover:text-black data-[state=open]:bg-primary-400 data-[state=open]:text-black"
                    >
                      <div
                        className="child flex items-center justify-center rounded-full bg-mineshaft pr-1 text-mineshaft-300 hover:bg-mineshaft-500"
                        style={{ fontSize: "11px", width: "26px", height: "26px" }}
                      >
                        {user?.firstName?.charAt(0)}
                        {user?.lastName && user?.lastName?.charAt(0)}
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
                      <Link to={`/org/${currentOrg?.id}/admin`}>
                        <DropdownMenuItem className="mt-1 border-t border-mineshaft-600">
                          Organization Admin Console
                        </DropdownMenuItem>
                      </Link>
                      <div className="mt-1 h-1 border-t border-mineshaft-600" />
                      <button type="button" onClick={logOutUser} className="w-full">
                        <DropdownMenuItem>Log Out</DropdownMenuItem>
                      </button>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="px-1">
                  <Menu className="mt-4">
                    <Link
                      to={`/organization/$organizationId/${ProjectType.SecretManager}` as const}
                      params={{ organizationId: currentOrg.id }}
                      activeOptions={{ exact: true }}
                    >
                      {({ isActive }) => (
                        <MenuItem isSelected={isActive} icon="system-outline-165-view-carousel">
                          Secret Management
                        </MenuItem>
                      )}
                    </Link>
                    <Link
                      to={
                        `/organization/$organizationid/${ProjectType.CertificateManager}` as const
                      }
                      params={{ organizationId: currentOrg.id }}
                      activeOptions={{ exact: true }}
                    >
                      {({ isActive }) => (
                        <MenuItem isSelected={isActive} icon="note">
                          Cert Management
                        </MenuItem>
                      )}
                    </Link>
                    <Link
                      to={`/organization/$organizationId/${ProjectType.KMS}` as const}
                      params={{ organizationId: currentOrg.id }}
                      activeOptions={{ exact: true }}
                    >
                      {({ isActive }) => (
                        <MenuItem isSelected={isActive} icon="note">
                          Key Management
                        </MenuItem>
                      )}
                    </Link>
                    <Link
                      to="/organization/$organizationId/members"
                      params={{ organizationId: currentOrg.id }}
                      activeOptions={{ exact: true }}
                    >
                      {({ isActive }) => (
                        <MenuItem isSelected={isActive} icon="system-outline-96-groups">
                          Access Control
                        </MenuItem>
                      )}
                    </Link>
                    <Link
                      to="/organization/$organizationId/secret-scanning"
                      params={{ organizationId: currentOrg.id }}
                      activeOptions={{ exact: true }}
                    >
                      {({ isActive }) => (
                        <MenuItem isSelected={isActive} icon="system-outline-69-document-scan">
                          Secret Scanning
                        </MenuItem>
                      )}
                    </Link>
                    <Link
                      to="/organization/$organizationId/secret-sharing"
                      params={{ organizationId: currentOrg.id }}
                      activeOptions={{ exact: true }}
                    >
                      {({ isActive }) => (
                        <MenuItem isSelected={isActive} icon="system-outline-90-lock-closed">
                          Secret Sharing
                        </MenuItem>
                      )}
                    </Link>
                    {(window.location.origin.includes("https://app.infisical.com") ||
                      window.location.origin.includes("https://eu.infisical.com") ||
                      window.location.origin.includes("https://gamma.infisical.com")) && (
                      <Link
                        to="/organization/$organizationId/billing"
                        params={{ organizationId: currentOrg.id }}
                        activeOptions={{ exact: true }}
                      >
                        {({ isActive }) => (
                          <MenuItem
                            isSelected={isActive}
                            icon="system-outline-103-coin-cash-monetization"
                          >
                            Usage &amps; Billing
                          </MenuItem>
                        )}
                      </Link>
                    )}
                    <Link
                      to="/organization/$organizationId/audit-logs"
                      params={{ organizationId: currentOrg.id }}
                      activeOptions={{ exact: true }}
                    >
                      {({ isActive }) => (
                        <MenuItem isSelected={isActive} icon="system-outline-168-view-headline">
                          Audit Logs
                        </MenuItem>
                      )}
                    </Link>
                    <Link
                      to="/organization/$organizationId/settings"
                      params={{ organizationId: currentOrg.id }}
                      activeOptions={{ exact: true }}
                    >
                      {({ isActive }) => (
                        <MenuItem
                          isSelected={isActive}
                          icon="system-outline-109-slider-toggle-settings"
                        >
                          Organization Settings
                        </MenuItem>
                      )}
                    </Link>
                  </Menu>
                </div>
              </div>
              <div
                className={`relative mt-10 ${
                  subscription && subscription.slug === "starter" && !subscription.has_used_trial
                    ? "mb-2"
                    : "mb-4"
                } flex w-full cursor-default flex-col items-center px-3 text-sm text-mineshaft-400`}
              >
                {(window.location.origin.includes("https://app.infisical.com") ||
                  window.location.origin.includes("https://gamma.infisical.com")) && <WishForm />}
                <div
                  onKeyDown={() => null}
                  role="button"
                  tabIndex={0}
                  onClick={() =>
                    navigate({
                      to: "/organization/$organizationId/members",
                      params: {
                        organizationId: currentOrg?.id
                      },
                      search: {
                        action: "invite"
                      }
                    })
                  }
                  className="w-full"
                >
                  <div className="mb-3 w-full pl-5 duration-200 hover:text-mineshaft-200">
                    <FontAwesomeIcon icon={faPlus} className="mr-3" />
                    Invite people
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <div className="mb-2 w-full pl-5 duration-200 hover:text-mineshaft-200">
                      <FontAwesomeIcon icon={faQuestion} className="mr-3 px-[0.1rem]" />
                      Help & Support
                    </div>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="p-1">
                    {supportOptions.map(([icon, text, url]) => (
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
                    {infisicalPlatformVersion && (
                      <div className="mb-2 mt-2 w-full cursor-default pl-5 text-sm duration-200 hover:text-mineshaft-200">
                        <FontAwesomeIcon icon={faInfo} className="mr-4 px-[0.1rem]" />
                        Version: {infisicalPlatformVersion}
                      </div>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
                {subscription &&
                  subscription.slug === "starter" &&
                  !subscription.has_used_trial && (
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
                        <FontAwesomeIcon
                          icon={faInfinity}
                          className="ml-0.5 mr-3 py-2 text-primary"
                        />
                        Start Free Pro Trial
                      </div>
                    </button>
                  )}
              </div>
            </nav>
          </aside>
          {
            // <CreateOrgModal
            //   isOpen={popUp?.createOrg?.isOpen}
            //   onClose={() => handlePopUpToggle("createOrg", false)}
            // />
          }
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
