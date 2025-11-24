import { useEffect, useState } from "react";
import { faGithub, faSlack } from "@fortawesome/free-brands-svg-icons";
import { faCircleQuestion, faUserCircle } from "@fortawesome/free-regular-svg-icons";
import {
  faArrowUpRightFromSquare,
  faBook,
  faCaretDown,
  faCheck,
  faChevronRight,
  faEnvelope,
  faExclamationTriangle,
  faInfinity,
  faInfo,
  faInfoCircle,
  faPlus,
  faSignOut,
  faToolbox,
  faUser,
  faUserCog,
  faUserPlus,
  faUsers
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { UserPlusIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { Mfa } from "@app/components/auth/Mfa";
import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import SecurityClient from "@app/components/utilities/SecurityClient";
import {
  BreadcrumbContainer,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownSubMenu,
  DropdownSubMenuContent,
  DropdownSubMenuTrigger,
  IconButton,
  Modal,
  ModalContent,
  TBreadcrumbFormat,
  Tooltip
} from "@app/components/v2";
import { Badge, InstanceIcon, OrgIcon, SubOrgIcon } from "@app/components/v3";
import { envConfig } from "@app/config/env";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  useOrganization,
  useSubscription,
  useUser
} from "@app/context";
import { isInfisicalCloud } from "@app/helpers/platform";
import { useToggle } from "@app/hooks";
import {
  projectKeys,
  subOrganizationsQuery,
  useGetOrganizations,
  useGetOrgTrialUrl,
  useLogoutUser
} from "@app/hooks/api";
import { authKeys, selectOrganization, selectSubOrganization } from "@app/hooks/api/auth/queries";
import { MfaMethod } from "@app/hooks/api/auth/types";
import { getAuthToken } from "@app/hooks/api/reactQuery";
import { Organization, SubscriptionPlan } from "@app/hooks/api/types";
import { AuthMethod } from "@app/hooks/api/users/types";
import { navigateUserToOrg } from "@app/pages/auth/LoginPage/Login.utils";

import { ServerAdminsPanel } from "../ServerAdminsPanel/ServerAdminsPanel";
import { NewSubOrganizationForm } from "./NewSubOrganizationForm";
import { NotificationDropdown } from "./NotificationDropdown";

const getPlan = (subscription: SubscriptionPlan) => {
  if (subscription.groups) return "Enterprise";
  if (subscription.pitRecovery) return "Pro";
  return "Free";
};

const getFormattedSupportEmailLink = (variables: {
  org_id: string;
  domain: string;
  root_org_id?: string;
}) => {
  const email = "support@infisical.com";

  const body = `Hello Infisical Support Team,

Issue Details:
[What you did]
[What you expected to happen]
[What actually happened]
[Any error request IDs]
[Any supporting screenshots or video recording of the issue/request at hand]

Account Info:
- Organization ID: ${variables.org_id}
${variables.root_org_id ? `- Root Organization ID: ${variables.root_org_id}` : ""}
- Domain: ${variables.domain}

Thank you,
[Your Name]`;

  return `mailto:${email}?body=${encodeURIComponent(body)}`;
};

export const INFISICAL_SUPPORT_OPTIONS = [
  [
    <FontAwesomeIcon key={1} className="pr-4 text-sm" icon={faSlack} />,
    "Support Forum",
    () => "https://infisical.com/slack"
  ],
  [
    <FontAwesomeIcon key={2} className="pr-4 text-sm" icon={faBook} />,
    "Read Docs",
    () => "https://infisical.com/docs/documentation/getting-started/introduction"
  ],
  [
    <FontAwesomeIcon key={3} className="pr-4 text-sm" icon={faGithub} />,
    "GitHub Issues",
    () => "https://github.com/Infisical/infisical/issues"
  ],
  [
    <FontAwesomeIcon key={4} className="pr-4 text-sm" icon={faEnvelope} />,
    "Email Support",
    getFormattedSupportEmailLink
  ],
  [
    <FontAwesomeIcon key={5} className="pr-4 text-sm" icon={faUsers} />,
    "Instance Admins",
    () => "server-admins"
  ],
  [
    <FontAwesomeIcon key={6} className="pr-4 text-sm" icon={faToolbox} />,
    "Version Upgrade Tool",
    () => "/upgrade-path"
  ]
] as const;

export const Navbar = () => {
  const { user } = useUser();
  const { subscription } = useSubscription();
  const { currentOrg, isSubOrganization } = useOrganization();

  const [showAdminsModal, setShowAdminsModal] = useState(false);
  const [showSubOrgForm, setShowSubOrgForm] = useState(false);
  const [showCardDeclinedModal, setShowCardDeclinedModal] = useState(false);

  const subOrgQuery = subOrganizationsQuery.list({ limit: 500, isAccessible: true });
  const { data: subOrganizations = [] } = useQuery({
    ...subOrgQuery,
    enabled: Boolean(subscription.subOrganization)
  });

  const isCardDeclined = Boolean(subscription?.cardDeclined);
  const isCardDeclinedMoreThan30Days = Boolean(
    isCardDeclined && subscription?.cardDeclinedDays && subscription?.cardDeclinedDays >= 30
  );

  const { data: orgs } = useGetOrganizations();
  const navigate = useNavigate();
  const [requiredMfaMethod, setRequiredMfaMethod] = useState(MfaMethod.EMAIL);
  const [mfaSuccessCallback, setMfaSuccessCallback] = useState<() => void>(() => {});
  const [shouldShowMfa, toggleShowMfa] = useToggle(false);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isOrgSelectOpen, setIsOrgSelectOpen] = useState(false);

  const location = useLocation();
  const isBillingPage = location.pathname === "/organization/billing";

  const isModalIntrusive = Boolean(!isBillingPage && isCardDeclinedMoreThan30Days);

  const rootOrg = isSubOrganization
    ? orgs?.find((org) => org.id === currentOrg.rootOrgId) || currentOrg
    : currentOrg;

  useEffect(() => {
    if (isModalIntrusive) {
      setShowCardDeclinedModal(true);
      sessionStorage.setItem("paymentFailed", "true");
      return;
    }

    if (isCardDeclined && !sessionStorage.getItem("paymentFailed")) {
      sessionStorage.setItem("paymentFailed", "true");
      setShowCardDeclinedModal(true);
    }
  }, [subscription, isBillingPage, isModalIntrusive]);

  const matches = useRouterState({ select: (s) => s.matches.at(-1)?.context });
  const breadcrumbs = matches && "breadcrumbs" in matches ? matches.breadcrumbs : undefined;

  const handleOrgChange = async (orgId: string) => {
    queryClient.removeQueries({ queryKey: authKeys.getAuthToken });

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

    SecurityClient.setToken(token);
    SecurityClient.setProviderAuthToken("");
    queryClient.removeQueries({ queryKey: projectKeys.getAllUserProjects() });

    await router.invalidate();
    await navigateUserToOrg(navigate, orgId);
    queryClient.removeQueries({ queryKey: subOrgQuery.queryKey });
  };

  const handleSubOrgChange = async (subOrgId: string) => {
    queryClient.removeQueries({ queryKey: authKeys.getAuthToken });

    const { token, isMfaEnabled, mfaMethod } = await selectSubOrganization({
      subOrganizationId: subOrgId
    });

    if (isMfaEnabled) {
      SecurityClient.setMfaToken(token);
      if (mfaMethod) {
        setRequiredMfaMethod(mfaMethod);
      }
      toggleShowMfa.on();
      setMfaSuccessCallback(() => () => handleSubOrgChange(subOrgId));
      return;
    }

    SecurityClient.setToken(token);
    SecurityClient.setProviderAuthToken("");

    queryClient.removeQueries({ queryKey: projectKeys.getAllUserProjects() });
    await router.invalidate();
    navigate({
      to: "/organizations/$orgId/projects",
      params: { orgId: subOrgId }
    });
  };

  const { mutateAsync } = useGetOrgTrialUrl();

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

  const handleCopyToken = async () => {
    try {
      await window.navigator.clipboard.writeText(getAuthToken());
      createNotification({
        type: "success",
        text: "Copied current login session token to clipboard"
      });
    } catch (error) {
      console.log(error);
      createNotification({ type: "error", text: "Failed to copy user token to clipboard" });
    }
  };

  if (shouldShowMfa) {
    return (
      <div className="flex max-h-screen min-h-screen flex-col items-center justify-center gap-2 overflow-y-auto bg-linear-to-tr from-mineshaft-600 via-mineshaft-800 to-bunker-700">
        <Mfa
          email={user.email as string}
          method={requiredMfaMethod}
          successCallback={mfaSuccessCallback}
          closeMfa={() => toggleShowMfa.off()}
        />
      </div>
    );
  }

  const isServerAdminPanel = location.pathname.startsWith("/admin");

  const isProjectScope = location.pathname.startsWith(`/organizations/${currentOrg.id}/projects`);

  const handleOrgNav = async (org: Organization) => {
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

    if (org.googleSsoAuthEnforced) {
      await logout.mutateAsync();
      window.open(`/api/v1/sso/redirect/google?org_slug=${org.slug}`);
      window.close();
      return;
    }

    handleOrgChange(org?.id);
  };

  return (
    <div className="z-10 flex min-h-12 items-center bg-mineshaft-900 px-4 pt-1">
      <div className="mr-auto flex items-center overflow-hidden">
        <div className="shrink-0">
          <Link to="/organizations/$orgId/projects" params={{ orgId: currentOrg.id }}>
            <img alt="infisical logo" src="/images/logotransparent.png" className="h-4" />
          </Link>
        </div>
        <p className="pr-3 pl-1 text-lg text-mineshaft-400/70">/</p>
        {isServerAdminPanel ? (
          <>
            <Link
              to="/admin"
              className="group flex cursor-pointer items-center gap-2 text-sm text-white transition-all duration-100 hover:text-primary"
            >
              <InstanceIcon className="size-3.5 text-xs text-bunker-300" />
              <div className="whitespace-nowrap">Server Console</div>
            </Link>
            <p className="pr-3 pl-3 text-lg text-mineshaft-400/70">/</p>
            {breadcrumbs ? (
              // scott: remove /admin as we show server console above
              <BreadcrumbContainer breadcrumbs={breadcrumbs.slice(1) as TBreadcrumbFormat[]} />
            ) : null}
          </>
        ) : (
          <>
            <div className="flex min-w-12 items-center overflow-hidden">
              <DropdownMenu modal={false} open={isOrgSelectOpen} onOpenChange={setIsOrgSelectOpen}>
                <div className="group flex cursor-pointer items-center gap-2 overflow-hidden text-sm text-white transition-all duration-100 hover:text-primary">
                  <Badge
                    asChild
                    variant="org"
                    isTruncatable
                    // TODO(scott): either add badge size/style variant or create designated component for namespace/org nav bar
                    className={twMerge(
                      "gap-x-1.5 text-sm",
                      (isProjectScope || isSubOrganization) &&
                        "bg-transparent text-mineshaft-200 hover:!bg-transparent hover:underline [&>svg]:!text-org"
                    )}
                  >
                    <button
                      type="button"
                      onClick={async () => {
                        handleOrgChange(rootOrg.id);
                        if (isSubOrganization) {
                          await router.invalidate({ sync: true }).catch(() => null);
                        }
                      }}
                    >
                      <OrgIcon className="size-[12px]" />
                      <span>{rootOrg?.name}</span>
                    </button>
                  </Badge>
                  <div className="mr-1 hidden rounded-sm border border-mineshaft-500 px-1 text-xs text-bunker-300 no-underline! md:inline-block">
                    {getPlan(subscription)}
                  </div>
                  {subscription.cardDeclined && (
                    <Tooltip
                      content={`Your payment could not be processed${subscription.cardDeclinedReason ? `: ${subscription.cardDeclinedReason}` : ""}. Please update your payment method to continue enjoying premium features.`}
                      className="max-w-xs"
                    >
                      <div className="flex items-center">
                        <FontAwesomeIcon
                          icon={faExclamationTriangle}
                          className="animate-pulse cursor-help text-xs text-primary-400"
                        />
                      </div>
                    </Tooltip>
                  )}
                </div>
                <DropdownMenuTrigger asChild>
                  <div>
                    <IconButton
                      variant="plain"
                      colorSchema="secondary"
                      ariaLabel="switch-org"
                      className="px-2 py-1"
                    >
                      <FontAwesomeIcon icon={faCaretDown} className="text-xs text-bunker-300" />
                    </IconButton>
                  </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="center"
                  side="bottom"
                  className="mt-6 cursor-default p-1 shadow-mineshaft-600 drop-shadow-md"
                  style={{ minWidth: "220px" }}
                >
                  <div className="px-2 py-1 text-xs text-mineshaft-400 capitalize">
                    Organizations
                  </div>
                  {orgs?.map((org) => {
                    if (
                      subscription.subOrganization &&
                      (org.id === currentOrg?.id || org.id === currentOrg?.parentOrgId)
                    ) {
                      return (
                        <DropdownSubMenu key={`${org.id}-sub-orgs`}>
                          <DropdownSubMenuTrigger
                            onClick={() => {
                              setIsOrgSelectOpen(false);
                              handleOrgNav(org);
                            }}
                            className="cursor-pointer font-normal"
                          >
                            <div className="flex w-full max-w-48 cursor-pointer items-center gap-x-2">
                              {currentOrg?.id === org.id && (
                                <FontAwesomeIcon icon={faCheck} className="shrink-0 text-primary" />
                              )}
                              <p className="truncate">{org.name}</p>
                              <FontAwesomeIcon className="ml-auto shrink-0" icon={faChevronRight} />
                            </div>
                          </DropdownSubMenuTrigger>
                          <DropdownSubMenuContent
                            sideOffset={8}
                            alignOffset={-24}
                            className="mt-6 cursor-default p-1 shadow-mineshaft-600 drop-shadow-md"
                            style={{ minWidth: "220px" }}
                          >
                            <div className="px-2 py-1 text-xs text-mineshaft-400 capitalize">
                              Sub-Organizations
                            </div>
                            {subOrganizations.map((subOrg) => (
                              <DropdownMenuItem
                                onClick={() => handleSubOrgChange(subOrg.id)}
                                className="cursor-pointer font-normal"
                                key={subOrg.id}
                              >
                                <div className="flex w-full max-w-48 cursor-pointer items-center gap-x-2">
                                  {currentOrg?.id === subOrg.id && (
                                    <FontAwesomeIcon
                                      icon={faCheck}
                                      className="shrink-0 text-primary"
                                    />
                                  )}
                                  <p className="truncate">{subOrg.name}</p>
                                </div>
                              </DropdownMenuItem>
                            ))}
                            {Boolean(subOrganizations.length) && (
                              <div className="mt-1 h-1 border-t border-mineshaft-600" />
                            )}
                            <DropdownMenuItem
                              className="cursor-pointer"
                              icon={<FontAwesomeIcon icon={faPlus} />}
                              onClick={() => setShowSubOrgForm(true)}
                            >
                              New Sub-Organization
                            </DropdownMenuItem>
                          </DropdownSubMenuContent>
                        </DropdownSubMenu>
                      );
                    }

                    return (
                      <DropdownMenuItem
                        onClick={() => handleOrgNav(org)}
                        className="cursor-pointer font-normal"
                        key={org.id}
                      >
                        <div className="flex w-full max-w-48 cursor-pointer items-center gap-x-2">
                          {currentOrg?.id === org.id && (
                            <FontAwesomeIcon icon={faCheck} className="shrink-0 text-primary" />
                          )}
                          <p className="truncate">{org.name}</p>
                        </div>
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
            {isSubOrganization && (
              <>
                <p className="pr-3 pl-1 text-lg text-mineshaft-400/70">/</p>
                <DropdownMenu modal={false}>
                  <Badge
                    asChild
                    isTruncatable
                    variant="sub-org"
                    // TODO(scott): either add badge size/style variant or create designated component for namespace/org nav bar
                    className={twMerge(
                      "gap-x-1.5 text-sm",
                      isProjectScope &&
                        "min-w-6 bg-transparent text-mineshaft-200 hover:!bg-transparent hover:underline [&>svg]:!text-sub-org"
                    )}
                  >
                    <Link to="/organizations/$orgId/projects" params={{ orgId: currentOrg.id }}>
                      <SubOrgIcon className="size-[12px]" />
                      <span>{currentOrg.name}</span>
                    </Link>
                  </Badge>
                  <DropdownMenuTrigger asChild>
                    <div>
                      <IconButton
                        variant="plain"
                        colorSchema="secondary"
                        ariaLabel="switch-org"
                        className="px-2 py-1"
                      >
                        <FontAwesomeIcon icon={faCaretDown} className="text-xs text-bunker-300" />
                      </IconButton>
                    </div>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="center"
                    side="bottom"
                    className="mt-6 cursor-default p-1 shadow-mineshaft-600 drop-shadow-md"
                    style={{ minWidth: "220px" }}
                  >
                    <div className="px-2 py-1 text-xs text-mineshaft-400 capitalize">
                      Sub-Organizations
                    </div>
                    {subOrganizations.map((subOrg) => (
                      <DropdownMenuItem
                        onClick={() => handleSubOrgChange(subOrg.id)}
                        className="cursor-pointer font-normal"
                        key={subOrg.id}
                      >
                        <div className="flex w-full max-w-48 cursor-pointer items-center gap-x-2">
                          {currentOrg?.id === subOrg.id && (
                            <FontAwesomeIcon icon={faCheck} className="shrink-0 text-primary" />
                          )}
                          <p className="truncate">{subOrg.name}</p>
                        </div>
                      </DropdownMenuItem>
                    ))}
                    {Boolean(subOrganizations.length) && (
                      <div className="mt-1 h-1 border-t border-mineshaft-600" />
                    )}
                    <DropdownMenuItem
                      className="cursor-pointer"
                      icon={<FontAwesomeIcon icon={faPlus} />}
                      onClick={() => setShowSubOrgForm(true)}
                    >
                      New Sub-Organization
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
            {isProjectScope && (
              <>
                <p className="pr-3 pl-1 text-lg text-mineshaft-400/70">/</p>
                {breadcrumbs ? (
                  <BreadcrumbContainer
                    className="min-w-[15rem] flex-1"
                    breadcrumbs={[breadcrumbs[0]] as TBreadcrumbFormat[]}
                  />
                ) : null}
              </>
            )}
          </>
        )}
      </div>
      {subscription && subscription.slug === "starter" && !subscription.has_used_trial && (
        <Tooltip content="Start Free Pro Trial">
          <Button
            variant="plain"
            className="mr-2 border-mineshaft-500 px-2.5 py-1.5 whitespace-nowrap text-mineshaft-200 hover:bg-mineshaft-600"
            leftIcon={<FontAwesomeIcon icon={faInfinity} />}
            onClick={async () => {
              if (!subscription || !rootOrg) return;

              // direct user to start pro trial
              const url = await mutateAsync({
                orgId: rootOrg.id,
                success_url: window.location.href
              });

              window.location.href = url;
            }}
          >
            Free Pro Trial
          </Button>
        </Tooltip>
      )}
      {/* eslint-disable-next-line no-nested-ternary */}
      {!location.pathname.startsWith("/admin") ? (
        user.superAdmin ? (
          <Link
            className="mr-2 flex h-[34px] items-center rounded-md border border-mineshaft-500 px-2.5 py-1.5 text-sm whitespace-nowrap text-mineshaft-200 hover:bg-mineshaft-600"
            to="/admin"
          >
            <InstanceIcon className="inline-block size-3.5" />
            <span className="ml-2 hidden md:inline-block">Server Console</span>
          </Link>
        ) : (
          <OrgPermissionCan I={OrgPermissionActions.Create} a={OrgPermissionSubjects.Member}>
            {(isAllowed) =>
              isAllowed ? (
                <Link
                  className="mr-2 flex h-[34px] items-center rounded-md border border-mineshaft-500 px-2.5 py-1.5 text-sm whitespace-nowrap text-mineshaft-200 hover:bg-mineshaft-600"
                  to="/organizations/$orgId/access-management"
                  params={{ orgId: currentOrg.id }}
                  search={{
                    selectedTab: "members",
                    action: "invite-members"
                  }}
                >
                  <UserPlusIcon className="inline-block size-3.5" />
                  <span className="ml-2 hidden md:inline-block">Invite Members</span>
                </Link>
              ) : null
            }
          </OrgPermissionCan>
        )
      ) : null}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger>
          <div className="rounded-l-md border border-r-0 border-mineshaft-500 px-2.5 py-1 hover:bg-mineshaft-600">
            <FontAwesomeIcon icon={faCircleQuestion} className="text-mineshaft-200" />
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="bottom" className="mt-3 p-1">
          {INFISICAL_SUPPORT_OPTIONS.map(([icon, text, getUrl]) => {
            const url =
              text === "Email Support"
                ? getUrl({
                    org_id: currentOrg.id,
                    domain: window.location.origin,
                    ...(isSubOrganization && { root_org_id: rootOrg.id })
                  })
                : getUrl();

            if (url === "server-admins" && isInfisicalCloud()) {
              return null;
            }
            if (url === "upgrade-path" && isInfisicalCloud()) {
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
                    <div className="relative flex w-full cursor-pointer items-center justify-start rounded-md select-none">
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
                    <div className="relative flex w-full cursor-pointer items-center justify-start rounded-md select-none">
                      {icon}
                      <div className="text-sm">{text}</div>
                    </div>
                  </a>
                )}
              </DropdownMenuItem>
            );
          })}
          {envConfig.PLATFORM_VERSION && (
            <div className="mt-2 mb-2 w-full cursor-default pl-5 text-sm duration-200 hover:text-mineshaft-200">
              <FontAwesomeIcon icon={faInfo} className="mr-4 px-[0.1rem]" />
              Version: {envConfig.PLATFORM_VERSION}
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <NotificationDropdown />
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <div className="rounded-r-md border border-mineshaft-500 px-2.5 py-1 hover:bg-mineshaft-600">
            <FontAwesomeIcon icon={faUserCircle} className="text-mineshaft-200" />
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" align="end" className="mt-3 p-1">
          <div className="cursor-default px-1 py-1">
            <div className="flex w-full items-center justify-center rounded-md border border-mineshaft-600 bg-linear-to-tr from-primary-500/10 to-mineshaft-800 p-1 px-2 transition-all duration-150">
              <div className="p-1 pr-3">
                <FontAwesomeIcon icon={faUser} className="text-xl text-mineshaft-400" />
              </div>
              <div className="flex grow flex-col text-white">
                <div className="max-w-36 truncate text-sm font-medium text-ellipsis capitalize">
                  {user?.firstName} {user?.lastName}
                </div>
                <div className="text-xs text-mineshaft-300">{user.email}</div>
              </div>
            </div>
          </div>
          <Link to="/personal-settings">
            <DropdownMenuItem icon={<FontAwesomeIcon icon={faUserCog} />}>
              Personal Settings
            </DropdownMenuItem>
          </Link>
          <OrgPermissionCan I={OrgPermissionActions.Create} a={OrgPermissionSubjects.Member}>
            {(isAllowed) =>
              isAllowed ? (
                <Link
                  to="/organizations/$orgId/access-management"
                  params={{ orgId: currentOrg.id }}
                  search={{
                    selectedTab: "members",
                    action: "invite-members"
                  }}
                >
                  <DropdownMenuItem icon={<FontAwesomeIcon icon={faUserPlus} />}>
                    Invite Members
                  </DropdownMenuItem>
                </Link>
              ) : null
            }
          </OrgPermissionCan>
          <a
            href="https://infisical.com/docs/documentation/getting-started/introduction"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 w-full text-sm leading-[1.2rem] font-normal text-mineshaft-300 hover:text-mineshaft-100"
          >
            <DropdownMenuItem>
              Documentation
              <FontAwesomeIcon
                icon={faArrowUpRightFromSquare}
                className="text-xxs mb-[0.06rem] pl-1.5"
              />
            </DropdownMenuItem>
          </a>
          <a
            href="https://infisical.com/slack"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 w-full text-sm leading-[1.2rem] font-normal text-mineshaft-300 hover:text-mineshaft-100"
          >
            <DropdownMenuItem>
              Join Slack Community
              <FontAwesomeIcon
                icon={faArrowUpRightFromSquare}
                className="text-xxs mb-[0.06rem] pl-1.5"
              />
            </DropdownMenuItem>
          </a>
          <div className="mt-1 h-1 border-t border-mineshaft-600" />
          <DropdownMenuItem onClick={handleCopyToken}>
            Copy Token
            <Tooltip
              content="This token is linked to your current login session and can only access resources within the organization you're currently logged into."
              className="max-w-3xl"
            >
              <FontAwesomeIcon icon={faInfoCircle} className="pl-1.5 text-xs" />
            </Tooltip>
          </DropdownMenuItem>
          <div className="mt-1 h-1 border-t border-mineshaft-600" />
          <DropdownMenuItem onClick={logOutUser} icon={<FontAwesomeIcon icon={faSignOut} />}>
            Log Out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Modal
        isOpen={showCardDeclinedModal}
        onOpenChange={() => !isModalIntrusive && setShowCardDeclinedModal(false)}
      >
        <ModalContent
          title={
            <div className="flex items-center gap-2">
              <FontAwesomeIcon icon={faExclamationTriangle} className="text-lg text-primary-400" />
              Your payment could not be processed.
            </div>
          }
          showCloseButton={!isModalIntrusive}
        >
          <div>
            <div>
              <div className="mb-1">
                <p>
                  We were unable to process your last payment
                  {subscription.cardDeclinedReason ? `: ${subscription.cardDeclinedReason}` : ""}.
                  Please update your payment information to continue using premium features.
                </p>
              </div>
              <div className="mt-4">
                <div className="flex space-x-3">
                  <Link
                    to="/organizations/$orgId/billing"
                    params={{ orgId: rootOrg.id }}
                    className="inline-flex"
                  >
                    <Button
                      colorSchema="primary"
                      variant="solid"
                      onClick={() => setShowCardDeclinedModal(false)}
                    >
                      Update Payment Method
                    </Button>
                  </Link>
                  {!isModalIntrusive && (
                    <Button
                      colorSchema="secondary"
                      variant="outline"
                      onClick={() => setShowCardDeclinedModal(false)}
                    >
                      Dismiss
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </ModalContent>
      </Modal>
      <Modal isOpen={showSubOrgForm} onOpenChange={setShowSubOrgForm}>
        <ModalContent
          title="Create Sub-Organizations"
          subTitle="Define a new sub-organization under your current organization."
        >
          <div className="mb-2">
            <NewSubOrganizationForm
              onClose={() => {
                setShowSubOrgForm(false);
              }}
            />
          </div>
        </ModalContent>
      </Modal>
      <Modal isOpen={showAdminsModal} onOpenChange={setShowAdminsModal}>
        <ModalContent title="Server Administrators" subTitle="View all server administrators">
          <div className="mb-2">
            <ServerAdminsPanel />
          </div>
        </ModalContent>
      </Modal>
    </div>
  );
};
