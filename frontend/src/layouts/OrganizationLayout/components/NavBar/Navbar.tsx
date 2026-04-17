import { useEffect, useState } from "react";
import { faExclamationTriangle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  Book,
  Check,
  ChevronLeft,
  ChevronsUpDown,
  CircleHelp,
  Clipboard,
  ExternalLink,
  Github,
  Infinity,
  Info,
  LogOut,
  Mail,
  Plus,
  Settings,
  Slack,
  TriangleAlertIcon,
  User,
  UserPlus,
  Users
} from "lucide-react";
import { twMerge } from "tailwind-merge";

import { Mfa } from "@app/components/auth/Mfa";
import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import SecurityClient from "@app/components/utilities/SecurityClient";
import { Button as V2Button, Modal, ModalContent } from "@app/components/v2";
import {
  Badge,
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  InstanceIcon,
  OrgIcon,
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
  SubOrgIcon,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  UnstableButtonGroup,
  UnstableDropdownMenu,
  UnstableDropdownMenuContent,
  UnstableDropdownMenuItem,
  UnstableDropdownMenuSeparator,
  UnstableDropdownMenuTrigger,
  UnstableIconButton
} from "@app/components/v3";
import { SidebarTrigger } from "@app/components/v3/generic/Sidebar";
import { envConfig } from "@app/config/env";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  useOrganization,
  useSubscription,
  useUser
} from "@app/context";
import { OrgPermissionSubOrgActions } from "@app/context/OrgPermissionContext/types";
import { isInfisicalCloud } from "@app/helpers/platform";
import { useToggle } from "@app/hooks";
import {
  projectKeys,
  subOrganizationsQuery,
  useGetOrganizations,
  useGetOrgTrialUrl,
  useLogoutUser
} from "@app/hooks/api";
import { authKeys, selectOrganization } from "@app/hooks/api/auth/queries";
import { MfaMethod } from "@app/hooks/api/auth/types";
import { getAuthToken } from "@app/hooks/api/reactQuery";
import { SubscriptionPlanTypes } from "@app/hooks/api/subscriptions/types";
import { Organization, SubscriptionPlan } from "@app/hooks/api/types";
import { AuthMethod } from "@app/hooks/api/users/types";
import { ProjectSelect } from "@app/layouts/ProjectLayout/components/ProjectSelect";
import { navigateUserToOrg } from "@app/pages/auth/LoginPage/Login.utils";

import { ServerAdminsPanel } from "../ServerAdminsPanel/ServerAdminsPanel";
import { NewSubOrganizationForm } from "./NewSubOrganizationForm";
import { NotificationDropdown } from "./NotificationDropdown";
import { VersionBadge } from "./VersionBadge";

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
  [Slack, "Support Forum", () => "https://infisical.com/slack"],
  [
    Book,
    "Read Docs",
    () => "https://infisical.com/docs/documentation/getting-started/introduction"
  ],
  [Github, "GitHub Issues", () => "https://github.com/Infisical/infisical/issues"],
  [Mail, "Email Support", getFormattedSupportEmailLink],
  [Users, "Instance Admins", () => "server-admins"]
] as const;

export const Navbar = () => {
  const { user } = useUser();
  const { subscription } = useSubscription();
  const { currentOrg, isSubOrganization } = useOrganization();

  const [showAdminsModal, setShowAdminsModal] = useState(false);
  const [showSubOrgForm, setShowSubOrgForm] = useState(false);
  const [showCardDeclinedModal, setShowCardDeclinedModal] = useState(false);

  const subOrgQuery = subOrganizationsQuery.list({ isAccessible: true });
  const { data: subOrganizations = [] } = useQuery({
    ...subOrgQuery,
    enabled: Boolean(subscription.subOrganization),
    select: (data) => data.organizations
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
  const queryClient = useQueryClient();
  const [isOrgSelectOpen, setIsOrgSelectOpen] = useState(false);

  const location = useLocation();
  const isBillingPage = location.pathname === `/organizations/${currentOrg.id}/billing`;

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

  const handleOrgSelection = async ({
    organizationId,
    navigateTo,
    onSuccess
  }: {
    organizationId?: string;
    navigateTo?: string;
    onSuccess?: () => void | Promise<void>;
  }) => {
    if (!organizationId) return;

    if (organizationId === currentOrg.id) return;

    const { token, isMfaEnabled, mfaMethod } = await selectOrganization({ organizationId });

    if (isMfaEnabled) {
      SecurityClient.setMfaToken(token);
      if (mfaMethod) {
        setRequiredMfaMethod(mfaMethod);
      }
      toggleShowMfa.on();
      setMfaSuccessCallback(() => async () => {
        await handleOrgSelection({ organizationId, onSuccess });
      });
      return;
    }

    SecurityClient.setToken(token);
    SecurityClient.setProviderAuthToken("");
    queryClient.removeQueries({ queryKey: authKeys.getAuthToken });
    queryClient.removeQueries({ queryKey: subOrgQuery.queryKey });

    await queryClient.refetchQueries({ queryKey: authKeys.getAuthToken });

    await navigateUserToOrg({ navigate, organizationId, navigateTo });
    queryClient.removeQueries({ queryKey: projectKeys.allProjectQueries() });

    if (onSuccess) {
      await onSuccess();
    }
  };

  const handleNavigateToRootOrgBilling = async () => {
    const navigateToBilling = () => {
      navigate({
        to: "/organizations/$orgId/billing",
        params: { orgId: rootOrg.id }
      });
    };

    const onSuccess = () => {
      setShowCardDeclinedModal(false);
    };

    if (isSubOrganization) {
      await handleOrgSelection({ organizationId: rootOrg.id, onSuccess });
    } else {
      await navigateToBilling();
    }
  };

  const handleNavigateToAdminConsole = async () => {
    const navigateToAdminConsole = () => {
      navigate({
        to: "/admin"
      });
    };

    if (isSubOrganization) {
      await handleOrgSelection({ organizationId: rootOrg.id, navigateTo: "/admin" });
    } else {
      navigateToAdminConsole();
    }
  };

  const { mutateAsync } = useGetOrgTrialUrl();

  const logout = useLogoutUser();
  const logOutUser = async () => {
    try {
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

  const isProjectScope =
    location.pathname.startsWith(`/organizations/${currentOrg.id}/projects`) &&
    location.pathname !== `/organizations/${currentOrg.id}/projects`;

  const handleOrgNav = async (org: Organization) => {
    if (currentOrg?.id === org.id) return;

    if (org.authEnforced) {
      // org has an org-level auth method enabled (e.g. SAML)
      // -> logout + redirect to SAML SSO

      await logout.mutateAsync();
      if (org.orgAuthMethod === AuthMethod.OIDC) {
        window.open(`/api/v1/sso/oidc/login?domain=${org.slug}`);
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

    handleOrgSelection({ organizationId: org?.id });
  };

  return (
    <div
      className={twMerge(
        "z-10 flex min-h-12 items-center border-b border-border bg-gradient-to-br to-transparent",
        isServerAdminPanel && "from-admin/5",
        !isServerAdminPanel && isProjectScope && "from-project/5",
        !isServerAdminPanel && !isProjectScope && isSubOrganization && "from-sub-org/5",
        !isServerAdminPanel && !isProjectScope && !isSubOrganization && "from-org/5"
      )}
    >
      <SidebarTrigger variant="ghost" className="ml-2 lg:hidden" />
      <div className="mr-auto flex h-full min-w-34 items-center">
        {isServerAdminPanel ? (
          <div className="flex h-full items-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  to="/organizations/$orgId/projects"
                  params={{ orgId: currentOrg.id }}
                  className="flex h-full items-center gap-x-1 border-r border-border pr-4 pl-2 text-muted transition-colors hover:text-foreground"
                >
                  <ChevronLeft className="size-4" />
                  <OrgIcon className="size-3.5" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="bottom">Back to organization</TooltipContent>
            </Tooltip>
            <Link
              to="/admin"
              className="group flex cursor-pointer items-center gap-2 pl-4 text-sm text-white transition-all duration-100"
            >
              <InstanceIcon className="size-3.5 text-admin" />
              <div className="whitespace-nowrap">Server Console</div>
            </Link>
          </div>
        ) : (
          <>
            <div
              className={twMerge(
                "flex h-full min-w-0 items-center overflow-hidden border-border pr-2 pl-4 transition-all duration-300 ease-in-out",
                isProjectScope ? "mr-2 w-[72px] border-r" : "mr-4 w-96 max-w-96"
              )}
            >
              <Popover open={isOrgSelectOpen} onOpenChange={setIsOrgSelectOpen}>
                <PopoverAnchor className="absolute left-2" />
                <div className="group mr-1 flex min-w-0 cursor-pointer items-center gap-2 overflow-hidden text-sm text-white transition-all duration-100">
                  <button
                    className="flex cursor-pointer items-center gap-x-2 truncate whitespace-nowrap"
                    type="button"
                    onClick={() => {
                      navigate({
                        to: "/organizations/$orgId/projects",
                        params: { orgId: currentOrg.id }
                      });
                    }}
                  >
                    {isSubOrganization ? (
                      <SubOrgIcon
                        className={twMerge(
                          "size-[14px] shrink-0",
                          !isProjectScope ? "text-sub-org" : "text-muted"
                        )}
                      />
                    ) : (
                      <OrgIcon
                        className={twMerge(
                          "size-[14px] shrink-0",
                          !isProjectScope ? "text-org" : "text-muted"
                        )}
                      />
                    )}

                    <span className="truncate">
                      {isSubOrganization ? currentOrg?.name : rootOrg?.name}
                    </span>
                    <Badge
                      variant={isSubOrganization ? "sub-org" : "org"}
                      className="hidden lg:inline-flex"
                    >
                      {isSubOrganization ? "Sub-Organization" : "Organization"}
                    </Badge>
                  </button>
                  {subscription.cardDeclined && !isProjectScope && !isSubOrganization && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center">
                          <TriangleAlertIcon className="size-3.5 animate-pulse cursor-help text-warning" />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        Your payment could not be processed
                        {subscription.cardDeclinedReason
                          ? `: ${subscription.cardDeclinedReason}`
                          : ""}
                        . Please update your payment method to continue enjoying premium features.
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
                <PopoverTrigger asChild>
                  <UnstableIconButton variant="ghost" size="xs" aria-label="switch-org">
                    <ChevronsUpDown />
                  </UnstableIconButton>
                </PopoverTrigger>
                <PopoverContent align="start" sideOffset={20} className="w-96 p-0">
                  <Command>
                    <CommandInput placeholder="Search organizations..." />
                    <CommandList>
                      <CommandEmpty>No organizations found.</CommandEmpty>
                      {/* Current Organization */}
                      <CommandGroup heading="Current Organization">
                        <CommandItem
                          value={rootOrg.name}
                          onSelect={() => {
                            setIsOrgSelectOpen(false);
                            if (isSubOrganization) {
                              handleOrgSelection({ organizationId: rootOrg.id });
                            } else {
                              navigate({
                                to: "/organizations/$orgId/projects",
                                params: { orgId: rootOrg.id }
                              });
                            }
                          }}
                        >
                          <Check className={!isSubOrganization ? "opacity-100" : "opacity-0"} />
                          <span className="truncate">{rootOrg.name}</span>
                        </CommandItem>
                      </CommandGroup>
                      {/* Sub-Organizations */}
                      {subscription.subOrganization && subOrganizations.length > 0 && (
                        <>
                          <CommandGroup className="ml-6" heading="Sub-Organizations">
                            {subOrganizations.map((subOrg) => (
                              <CommandItem
                                key={subOrg.id}
                                value={subOrg.name}
                                onSelect={() => {
                                  setIsOrgSelectOpen(false);
                                  handleOrgSelection({ organizationId: subOrg.id });
                                }}
                              >
                                <Check
                                  className={
                                    currentOrg?.id === subOrg.id ? "opacity-100" : "opacity-0"
                                  }
                                />
                                <span className="truncate">{subOrg.name}</span>
                              </CommandItem>
                            ))}
                            <OrgPermissionCan
                              I={OrgPermissionSubOrgActions.Create}
                              a={OrgPermissionSubjects.SubOrganization}
                            >
                              {(isAllowed) =>
                                isAllowed ? (
                                  <CommandItem
                                    className="text-muted"
                                    onSelect={() => {
                                      setIsOrgSelectOpen(false);
                                      setShowSubOrgForm(true);
                                    }}
                                  >
                                    <Plus />
                                    <span>New Sub-Organization</span>
                                  </CommandItem>
                                ) : null
                              }
                            </OrgPermissionCan>
                          </CommandGroup>
                          <CommandSeparator />
                        </>
                      )}
                      {/* Other Organizations */}
                      {orgs && orgs.filter((o) => o.id !== rootOrg.id).length > 0 && (
                        <CommandGroup heading="Other Organizations">
                          {orgs
                            .filter((o) => o.id !== rootOrg.id)
                            .map((org) => (
                              <CommandItem
                                key={org.id}
                                value={org.name}
                                onSelect={() => {
                                  setIsOrgSelectOpen(false);
                                  handleOrgNav(org);
                                }}
                              >
                                <span className="truncate">{org.name}</span>
                              </CommandItem>
                            ))}
                        </CommandGroup>
                      )}
                    </CommandList>
                    <div className="border-t border-border p-1">
                      <button
                        type="button"
                        className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-foreground hover:bg-foreground/5"
                        onClick={logOutUser}
                      >
                        <LogOut className="size-4" />
                        <span>Log Out</span>
                      </button>
                    </div>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            {isProjectScope && (
              <>
                {/* <ChevronRight size={18} className="mx-3 mt-[3px] text-mineshaft-400/70" /> */}
                <ProjectSelect />
              </>
            )}
          </>
        )}
      </div>

      {subscription &&
      subscription.slug === SubscriptionPlanTypes.Starter &&
      !subscription.has_used_trial ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="info"
              size="xs"
              className="mt-px mr-2"
              onClick={async () => {
                if (!subscription || !rootOrg) return;
                const url = await mutateAsync({
                  orgId: rootOrg.id,
                  success_url: window.location.href
                });
                window.location.href = url;
              }}
            >
              <Infinity />
              Free Pro Trial
            </Button>
          </TooltipTrigger>
          <TooltipContent>Start Free Pro Trial</TooltipContent>
        </Tooltip>
      ) : (
        <Badge variant="info" className="mt-[3px] mr-3 hidden md:inline-flex">
          {getPlan(subscription)}
        </Badge>
      )}
      <VersionBadge />
      {!location.pathname.startsWith("/admin") && user.superAdmin && (
        <Button variant="outline" size="xs" className="mt-px mr-2" asChild>
          <Link to="/admin" onClick={handleNavigateToAdminConsole}>
            <InstanceIcon />
            <span className="hidden md:inline">Server Console</span>
          </Link>
        </Button>
      )}
      {!location.pathname.startsWith("/admin") && !user.superAdmin && (
        <OrgPermissionCan I={OrgPermissionActions.Create} a={OrgPermissionSubjects.Member}>
          {(isAllowed) =>
            isAllowed ? (
              <Button variant="outline" size="sm" className="mr-2" asChild>
                <Link
                  to="/organizations/$orgId/access-management"
                  params={{ orgId: currentOrg.id }}
                  search={{
                    selectedTab: "members",
                    action: "invite-members"
                  }}
                >
                  <UserPlus />
                  <span className="hidden md:inline">Invite Users</span>
                </Link>
              </Button>
            ) : null
          }
        </OrgPermissionCan>
      )}
      <UnstableButtonGroup className="mr-2">
        <UnstableDropdownMenu modal={false}>
          <UnstableDropdownMenuTrigger asChild>
            <UnstableIconButton variant="outline" size="sm" aria-label="Help">
              <CircleHelp />
            </UnstableIconButton>
          </UnstableDropdownMenuTrigger>
          <UnstableDropdownMenuContent align="end" side="bottom" sideOffset={8}>
            {INFISICAL_SUPPORT_OPTIONS.map(([Icon, text, getUrl]) => {
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
              if (url === "server-admins") {
                return (
                  <UnstableDropdownMenuItem
                    key="server-admins"
                    onSelect={() => setShowAdminsModal(true)}
                  >
                    <Icon className="size-4" />
                    {text}
                  </UnstableDropdownMenuItem>
                );
              }

              return (
                <UnstableDropdownMenuItem key={url as string} asChild>
                  <a target="_blank" rel="noopener noreferrer" href={String(url)}>
                    <Icon />
                    {text}
                  </a>
                </UnstableDropdownMenuItem>
              );
            })}
            {envConfig.PLATFORM_VERSION && (
              <>
                <UnstableDropdownMenuSeparator />
                <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted">
                  <Info className="size-3.5" />
                  Version: {envConfig.PLATFORM_VERSION}
                </div>
              </>
            )}
          </UnstableDropdownMenuContent>
        </UnstableDropdownMenu>
        <NotificationDropdown />
        <UnstableDropdownMenu modal={false}>
          <UnstableDropdownMenuTrigger asChild>
            <UnstableIconButton variant="outline" size="sm" aria-label="User menu">
              <User />
            </UnstableIconButton>
          </UnstableDropdownMenuTrigger>
          <UnstableDropdownMenuContent side="bottom" align="end" sideOffset={8}>
            <div className="cursor-default px-3 py-2">
              <div className="text-sm font-medium capitalize">
                {user?.firstName} {user?.lastName}
              </div>
              <div className="text-muted-foreground text-xs">{user.email}</div>
            </div>
            <UnstableDropdownMenuSeparator />
            <UnstableDropdownMenuItem asChild>
              <Link to="/personal-settings">
                <Settings className="size-4" />
                Personal Settings
              </Link>
            </UnstableDropdownMenuItem>
            <OrgPermissionCan I={OrgPermissionActions.Create} a={OrgPermissionSubjects.Member}>
              {(isAllowed) =>
                isAllowed ? (
                  <UnstableDropdownMenuItem asChild>
                    <Link
                      to="/organizations/$orgId/access-management"
                      params={{ orgId: currentOrg.id }}
                      search={{
                        selectedTab: "members",
                        action: "invite-members"
                      }}
                    >
                      <UserPlus />
                      Invite Users
                    </Link>
                  </UnstableDropdownMenuItem>
                ) : null
              }
            </OrgPermissionCan>
            <UnstableDropdownMenuSeparator />
            <UnstableDropdownMenuItem asChild>
              <a
                href="https://infisical.com/docs/documentation/getting-started/introduction"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Book />
                Documentation
                <ExternalLink className="ml-auto size-3.5 opacity-50" />
              </a>
            </UnstableDropdownMenuItem>
            <UnstableDropdownMenuItem asChild>
              <a href="https://infisical.com/slack" target="_blank" rel="noopener noreferrer">
                <Slack />
                Join Slack Community
                <ExternalLink className="ml-auto size-3.5 opacity-50" />
              </a>
            </UnstableDropdownMenuItem>
            <UnstableDropdownMenuSeparator />
            <UnstableDropdownMenuItem onSelect={handleCopyToken}>
              <Clipboard />
              Copy Token
              <Tooltip>
                <TooltipTrigger>
                  <Info className="size-3.5 opacity-50" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  This token is linked to your current login session and can only access resources
                  within the organization you&apos;re currently logged into.
                </TooltipContent>
              </Tooltip>
            </UnstableDropdownMenuItem>
            <UnstableDropdownMenuSeparator />
            <UnstableDropdownMenuItem onSelect={logOutUser}>
              <LogOut />
              Log Out
            </UnstableDropdownMenuItem>
          </UnstableDropdownMenuContent>
        </UnstableDropdownMenu>
      </UnstableButtonGroup>

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
                  <V2Button
                    colorSchema="primary"
                    variant="solid"
                    onClick={handleNavigateToRootOrgBilling}
                  >
                    Update Payment Method
                  </V2Button>
                  {!isModalIntrusive && (
                    <V2Button
                      colorSchema="secondary"
                      variant="outline"
                      onClick={() => setShowCardDeclinedModal(false)}
                    >
                      Dismiss
                    </V2Button>
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
              handleOrgSelection={handleOrgSelection}
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
