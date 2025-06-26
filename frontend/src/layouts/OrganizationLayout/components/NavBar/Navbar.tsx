import { useState } from "react";
import { faGithub, faSlack } from "@fortawesome/free-brands-svg-icons";
import {
  faArrowUpRightFromSquare,
  faBook,
  faCheck,
  faEnvelope,
  faInfo,
  faSignOut,
  faSlash,
  faSort,
  faUser,
  faUsers
} from "@fortawesome/free-solid-svg-icons";
import { faCircleQuestion } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouter, useRouterState } from "@tanstack/react-router";

import { Mfa } from "@app/components/auth/Mfa";
import SecurityClient from "@app/components/utilities/SecurityClient";
import {
  BreadcrumbContainer,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Lottie,
  TBreadcrumbFormat
} from "@app/components/v2";
import { envConfig } from "@app/config/env";
import { useOrganization, useSubscription, useUser } from "@app/context";
import { isInfisicalCloud } from "@app/helpers/platform";
import { useToggle } from "@app/hooks";
import { useGetOrganizations, useLogoutUser, workspaceKeys } from "@app/hooks/api";
import { authKeys, selectOrganization } from "@app/hooks/api/auth/queries";
import { MfaMethod } from "@app/hooks/api/auth/types";
import { SubscriptionPlan } from "@app/hooks/api/types";
import { AuthMethod } from "@app/hooks/api/users/types";
import { navigateUserToOrg } from "@app/pages/auth/LoginPage/Login.utils";

const getPlan = (subscription: SubscriptionPlan) => {
  if (subscription.groups) return "Enterprise";
  if (subscription.pitRecovery) return "Pro";
  return "Free";
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

export const Navbar = () => {
  const { user } = useUser();
  const { subscription } = useSubscription();
  const { currentOrg } = useOrganization();
  const [openSupport, setOpenSupport] = useState(false);
  const [openUser, setOpenUser] = useState(false);

  const { data: orgs } = useGetOrganizations();
  const navigate = useNavigate();
  const [requiredMfaMethod, setRequiredMfaMethod] = useState(MfaMethod.EMAIL);
  const [mfaSuccessCallback, setMfaSuccessCallback] = useState<() => void>(() => {});
  const [shouldShowMfa, toggleShowMfa] = useToggle(false);
  const router = useRouter();
  const queryClient = useQueryClient();

  const matches = useRouterState({ select: (s) => s.matches.at(-1)?.context });
  const breadcrumbs = matches && "breadcrumbs" in matches ? matches.breadcrumbs : undefined;

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
    <div className="z-10 flex h-12 items-center gap-1 border-b border-mineshaft-600 bg-mineshaft-800 px-4 py-2">
      <div>
        <Link to="/organization/projects">
          <img alt="infisical logo" src="/images/logotransparent.png" className="h-4" />
        </Link>
      </div>
      <div className="flex items-center gap-2">
        <FontAwesomeIcon
          icon={faSlash}
          className="rotate-90 font-medium text-bunker-300"
          style={{ fontSize: "10px" }}
        />
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <div className="flex cursor-pointer items-center gap-2 text-sm text-white">
              <div className="max-w-32 overflow-hidden text-ellipsis">{currentOrg?.name}</div>
              <div className="rounded border border-mineshaft-500 p-1 text-xs text-bunker-300">
                {getPlan(subscription)}
              </div>
              <FontAwesomeIcon icon={faSort} className="text-xs text-bunker-300" />
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            side="bottom"
            className="mt-6 cursor-default p-1 shadow-mineshaft-600 drop-shadow-md"
            style={{ minWidth: "220px" }}
          >
            <div className="px-2 py-1 text-xs capitalize text-mineshaft-400">organizations</div>
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
            <DropdownMenuItem icon={<FontAwesomeIcon icon={faSignOut} />} onClick={logOutUser}>
              Log Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <FontAwesomeIcon
          icon={faSlash}
          className="mr-1 rotate-90 font-medium text-bunker-300"
          style={{ fontSize: "10px" }}
        />
      </div>
      <div>
        {breadcrumbs ? (
          <BreadcrumbContainer breadcrumbs={breadcrumbs as TBreadcrumbFormat[]} />
        ) : null}
      </div>
      <div className="flex-grow" />
      <DropdownMenu modal={false} open={openSupport} onOpenChange={setOpenSupport}>
        <DropdownMenuTrigger
          onMouseEnter={() => setOpenSupport(true)}
          onMouseLeave={() => setOpenSupport(false)}
        >
          <div>
            <FontAwesomeIcon icon={faCircleQuestion} size="xl" className="text-white" />
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          side="bottom"
          className="p-1"
          onMouseEnter={() => setOpenSupport(true)}
          onMouseLeave={() => setOpenSupport(false)}
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
      <DropdownMenu modal={false} open={openUser} onOpenChange={setOpenUser}>
        <DropdownMenuTrigger
          asChild
          onMouseEnter={() => setOpenUser(true)}
          onMouseLeave={() => setOpenUser(false)}
        >
          <div>
            <Lottie icon="user" className="w-14" />
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="bottom"
          align="end"
          className="p-1"
          onMouseEnter={() => setOpenUser(true)}
          onMouseLeave={() => setOpenUser(false)}
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
  );
};
