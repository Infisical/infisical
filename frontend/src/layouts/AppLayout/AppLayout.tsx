/* eslint-disable no-nested-ternary */
/* eslint-disable no-unexpected-multiline */
/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable vars-on-top */
/* eslint-disable no-var */
/* eslint-disable func-names */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import { useRouter } from "next/router";
import { faGithub, faSlack } from "@fortawesome/free-brands-svg-icons";
import {
  faAngleDown,
  faArrowLeft,
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

import { tempLocalStorage } from "@app/components/utilities/checks/tempLocalStorage";
import SecurityClient from "@app/components/utilities/SecurityClient";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  Menu,
  MenuItem
} from "@app/components/v2";
import { useOrganization, useSubscription, useUser, useWorkspace } from "@app/context";
import { usePopUp, useToggle } from "@app/hooks";
import { useGetOrgTrialUrl, useLogoutUser, useSelectOrganization } from "@app/hooks/api";
import { MfaMethod } from "@app/hooks/api/auth/types";
import { AuthMethod } from "@app/hooks/api/users/types";
import { ProjectType } from "@app/hooks/api/workspace/types";
import { InsecureConnectionBanner } from "@app/layouts/AppLayout/components/InsecureConnectionBanner";
import { ProjectSelect } from "@app/layouts/AppLayout/components/ProjectSelect";
import { navigateUserToOrg } from "@app/views/Login/Login.utils";
import { Mfa } from "@app/views/Login/Mfa";
import { CreateOrgModal } from "@app/views/Org/components";

import { ProjectSidebarItem } from "./components/ProjectSidebarItems";
import { WishForm } from "./components/WishForm/WishForm";

interface LayoutProps {
  children: React.ReactNode;
}

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

export const AppLayout = ({ children }: LayoutProps) => {
  const router = useRouter();

  const { mutateAsync } = useGetOrgTrialUrl();

  const { currentWorkspace } = useWorkspace();
  const { orgs, currentOrg } = useOrganization();

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
      router.push("/login");
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

    await navigateUserToOrg(router, orgId);
  };

  // TODO(akhilmhdh): This entire logic will be rechecked and will try to avoid
  // Placing the localstorage as much as possible
  // Wait till tony integrates the azure and its launched
  useEffect(() => {
    // Put a user in an org if they're not in one yet
    const putUserInOrg = async () => {
      if (tempLocalStorage("orgData.id") === "" && orgs?.[0]?.id) {
        localStorage.setItem("orgData.id", orgs?.[0]?.id);
      }
    };
    putUserInOrg();
  }, [router.query.id]);

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
                {!router.asPath.includes("personal") && (
                  <div className="flex h-12 cursor-default items-center px-3 pt-6">
                    {(currentWorkspace || router.asPath.includes("integrations")) && (
                      <Link href={`/org/${currentOrg?.id}/${currentWorkspace?.type}/overview`}>
                        <div className="pl-1 pr-2 text-mineshaft-400 duration-200 hover:text-mineshaft-100">
                          <FontAwesomeIcon icon={faArrowLeft} />
                        </div>
                      </Link>
                    )}
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
                        {/* <DropdownMenuItem key="add-org">
                          <Button
                            onClick={() => handlePopUpOpen("createOrg")}
                            variant="plain"
                            colorSchema="secondary"
                            size="xs"
                            className="flex w-full items-center justify-start p-0 font-normal"
                            leftIcon={
                              <FontAwesomeIcon icon={faPlus} className="mr-3 text-primary" />
                            }
                          >
                            <div className="flex w-full items-center justify-between">
                              Create New Organization
                            </div>
                          </Button>
                        </DropdownMenuItem> */}
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
                        <Link href="/personal-settings">
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
                          <Link href="/admin" legacyBehavior>
                            <DropdownMenuItem className="mt-1 border-t border-mineshaft-600">
                              Server Admin Console
                            </DropdownMenuItem>
                          </Link>
                        )}
                        <Link href={`/org/${currentOrg?.id}/admin`} legacyBehavior>
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
                )}
                {!router.asPath.includes("org") &&
                  !router.asPath.includes("app-connections") &&
                  (!router.asPath.includes("personal") && currentWorkspace ? (
                    <ProjectSelect />
                  ) : (
                    <Link href={`/org/${currentOrg?.id}/${currentWorkspace?.type}/overview`}>
                      <div className="my-6 flex cursor-default items-center justify-center pr-2 text-sm text-mineshaft-300 hover:text-mineshaft-100">
                        <FontAwesomeIcon icon={faArrowLeft} className="pr-3" />
                        Back to organization
                      </div>
                    </Link>
                  ))}
                <div className={`px-1 ${!router.asPath.includes("personal") ? "block" : "hidden"}`}>
                  <ProjectSidebarItem />
                  {(router.pathname.startsWith("/org") ||
                    router.pathname.startsWith("/app-connections")) && (
                    <Menu className="mt-4">
                      <Link
                        href={`/org/${currentOrg?.id}/${ProjectType.SecretManager}/overview`}
                        passHref
                      >
                        <a>
                          <MenuItem
                            isSelected={router.asPath.includes(
                              `/${ProjectType.SecretManager}/overview`
                            )}
                            icon="system-outline-165-view-carousel"
                          >
                            Secret Management
                          </MenuItem>
                        </a>
                      </Link>
                      <Link
                        href={`/org/${currentOrg?.id}/${ProjectType.CertificateManager}/overview`}
                        passHref
                      >
                        <a>
                          <MenuItem
                            isSelected={router.asPath.includes(
                              `/${ProjectType.CertificateManager}/overview`
                            )}
                            icon="note"
                          >
                            Cert Management
                          </MenuItem>
                        </a>
                      </Link>
                      <Link href={`/org/${currentOrg?.id}/${ProjectType.KMS}/overview`} passHref>
                        <a>
                          <MenuItem
                            isSelected={router.asPath.includes(`/${ProjectType.KMS}/overview`)}
                            icon="unlock"
                          >
                            Key Management
                          </MenuItem>
                        </a>
                      </Link>
                      <Link href={`/org/${currentOrg?.id}/ssh/overview`} passHref>
                        <a>
                          <MenuItem
                            isSelected={
                              router.asPath === `/org/${currentWorkspace?.id}/ssh/overview`
                            }
                            icon="system-regular-126-verified-hover-verified"
                          >
                            SSH
                          </MenuItem>
                        </a>
                      </Link>
                      <Link href={`/org/${currentOrg?.id}/members`} passHref>
                        <a>
                          <MenuItem
                            isSelected={router.asPath === `/org/${currentOrg?.id}/members`}
                            icon="system-outline-96-groups"
                          >
                            Access Control
                          </MenuItem>
                        </a>
                      </Link>
                      <Link href={`/org/${currentOrg?.id}/secret-scanning`} passHref>
                        <a>
                          <MenuItem
                            isSelected={router.asPath === `/org/${currentOrg?.id}/secret-scanning`}
                            icon="system-outline-69-document-scan"
                          >
                            Secret Scanning
                          </MenuItem>
                        </a>
                      </Link>
                      <Link href={`/org/${currentOrg?.id}/secret-sharing`} passHref>
                        <a>
                          <MenuItem
                            isSelected={router.asPath === `/org/${currentOrg?.id}/secret-sharing`}
                            icon="system-outline-90-lock-closed"
                          >
                            Secret Sharing
                          </MenuItem>
                        </a>
                      </Link>
                      <Link href={`/org/${currentOrg?.id}/user-secrets`} passHref>
                        <a>
                          <MenuItem
                            isSelected={router.asPath === `/org/${currentOrg?.id}/user-secrets`}
                            icon="system-outline-90-lock-closed"
                          >
                            User Secrets
                          </MenuItem>
                        </a>
                      </Link>
                      {(window.location.origin.includes("https://app.infisical.com") ||
                        window.location.origin.includes("https://eu.infisical.com") ||
                        window.location.origin.includes("https://gamma.infisical.com")) && (
                        <Link href={`/org/${currentOrg?.id}/billing`} passHref>
                          <a>
                            <MenuItem
                              isSelected={router.asPath === `/org/${currentOrg?.id}/billing`}
                              icon="system-outline-103-coin-cash-monetization"
                            >
                              Usage & Billing
                            </MenuItem>
                          </a>
                        </Link>
                      )}
                      <Link href={`/org/${currentOrg?.id}/audit-logs`} passHref>
                        <a>
                          <MenuItem
                            isSelected={router.asPath === `/org/${currentOrg?.id}/audit-logs`}
                            icon="system-outline-168-view-headline"
                          >
                            Audit Logs
                          </MenuItem>
                        </a>
                      </Link>
                      <Link href={`/org/${currentOrg?.id}/settings`} passHref>
                        <a>
                          <MenuItem
                            isSelected={router.asPath === `/org/${currentOrg?.id}/settings`}
                            icon="system-outline-109-slider-toggle-settings"
                          >
                            Organization Settings
                          </MenuItem>
                        </a>
                      </Link>
                    </Menu>
                  )}
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
                {router.asPath.includes("org") && (
                  <div
                    onKeyDown={() => null}
                    role="button"
                    tabIndex={0}
                    onClick={() => router.push(`/org/${router.query.id}/members?action=invite`)}
                    className="w-full"
                  >
                    <div className="mb-3 w-full pl-5 duration-200 hover:text-mineshaft-200">
                      <FontAwesomeIcon icon={faPlus} className="mr-3" />
                      Invite people
                    </div>
                  </div>
                )}
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
                          className="mr-3 ml-0.5 py-2 text-primary"
                        />
                        Start Free Pro Trial
                      </div>
                    </button>
                  )}
              </div>
            </nav>
          </aside>
          <CreateOrgModal
            isOpen={popUp?.createOrg?.isOpen}
            onClose={() => handlePopUpToggle("createOrg", false)}
          />
          <main className="flex-1 overflow-y-auto overflow-x-hidden bg-bunker-800 dark:[color-scheme:dark]">
            {children}
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
