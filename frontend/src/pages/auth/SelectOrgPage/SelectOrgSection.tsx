import { useCallback, useEffect, useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { faArrowRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import axios from "axios";
import { addSeconds, formatISO } from "date-fns";
import { jwtDecode } from "jwt-decode";

import { Mfa } from "@app/components/auth/Mfa";
import { createNotification } from "@app/components/notifications";
import { IsCliLoginSuccessful } from "@app/components/utilities/attemptCliLogin";
import SecurityClient from "@app/components/utilities/SecurityClient";
import { Button, ContentLoader, Spinner } from "@app/components/v2";
import { SessionStorageKeys } from "@app/const";
import { OrgMembershipRole } from "@app/helpers/roles";
import { useToggle } from "@app/hooks";
import {
  useGetOrganizations,
  useGetUser,
  useLogoutUser,
  useSelectOrganization
} from "@app/hooks/api";
import { MfaMethod, UserAgentType } from "@app/hooks/api/auth/types";
import { getAuthToken, isLoggedIn } from "@app/hooks/api/reactQuery";
import { Organization } from "@app/hooks/api/types";
import { AuthMethod } from "@app/hooks/api/users/types";

import { navigateUserToOrg } from "../LoginPage/Login.utils";

export const SelectOrganizationSection = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const organizations = useGetOrganizations();
  const selectOrg = useSelectOrganization();
  const { data: user, isPending: userLoading } = useGetUser();
  const [shouldShowMfa, toggleShowMfa] = useToggle(false);
  const [requiredMfaMethod, setRequiredMfaMethod] = useState(MfaMethod.EMAIL);
  const [isInitialOrgCheckLoading, setIsInitialOrgCheckLoading] = useState(true);

  const [mfaSuccessCallback, setMfaSuccessCallback] = useState<() => void>(() => {});

  const router = useRouter();
  const queryParams = new URLSearchParams(window.location.search);
  const orgId = queryParams.get("org_id");
  const callbackPort = queryParams.get("callback_port");
  const isAdminLogin = queryParams.get("is_admin_login") === "true";
  const mfaPending = queryParams.get("mfa_pending") === "true";
  const defaultSelectedOrg = organizations.data?.find((org) => org.id === orgId);

  const logout = useLogoutUser(true);
  const handleLogout = useCallback(async () => {
    try {
      console.log("Logging out...");
      await logout.mutateAsync();
      navigate({ to: "/login" });
    } catch (error) {
      console.error(error);
    }
  }, [logout, navigate]);

  const handleSelectOrganization = useCallback(
    async (organization: Organization) => {
      const isUserOrgAdmin = organization.userRole === OrgMembershipRole.Admin;
      const canBypassOrgAuth = organization.bypassOrgAuthEnabled && isUserOrgAdmin && isAdminLogin;

      if (isAdminLogin) {
        if (!organization.bypassOrgAuthEnabled) {
          createNotification({
            text: "This organization does not have bypass org auth enabled",
            type: "error"
          });
          return;
        }
        if (!isUserOrgAdmin) {
          createNotification({
            text: "Only organization admins can bypass org auth",
            type: "error"
          });
          return;
        }
      }

      if ((organization.authEnforced || organization.googleSsoAuthEnforced) && !canBypassOrgAuth) {
        const authToken = jwtDecode(getAuthToken()) as { authMethod: AuthMethod };

        // org has an org-level auth method enabled (e.g. SAML)
        // -> logout + redirect to SAML SSO
        let url = "";
        if (organization.googleSsoAuthEnforced) {
          if (authToken.authMethod !== AuthMethod.GOOGLE) {
            url = `/api/v1/sso/redirect/google?org_slug=${organization.slug}`;

            if (callbackPort) {
              url += `&callback_port=${callbackPort}`;
            }
          }
        } else if (organization.orgAuthMethod === AuthMethod.OIDC) {
          url = `/api/v1/sso/oidc/login?orgSlug=${organization.slug}${
            callbackPort ? `&callbackPort=${callbackPort}` : ""
          }`;
        } else if (organization.orgAuthMethod === AuthMethod.SAML) {
          url = `/api/v1/sso/redirect/saml2/organizations/${organization.slug}`;

          if (callbackPort) {
            url += `?callback_port=${callbackPort}`;
          }
        }

        // we are conditionally checking if the url is set because it may not be set if google SSO is enforced, but the user is already logged in with google SSO
        // see line 103-106
        if (url) {
          await logout.mutateAsync();
          window.location.href = url;
          return;
        }
      }

      let token;
      let isMfaEnabled;
      let mfaMethod;

      try {
        const result = await selectOrg.mutateAsync({
          organizationId: organization.id,
          userAgent: callbackPort ? UserAgentType.CLI : undefined
        });
        token = result.token;
        isMfaEnabled = result.isMfaEnabled;
        mfaMethod = result.mfaMethod;
      } catch (error: any) {
        setIsInitialOrgCheckLoading(false);
        if (error?.response?.status === 403) {
          await handleLogout();
          return;
        }
        throw error;
      } finally {
        setIsInitialOrgCheckLoading(false);
      }

      await router.invalidate();

      if (isMfaEnabled) {
        SecurityClient.setMfaToken(token);
        if (mfaMethod) {
          setRequiredMfaMethod(mfaMethod);
        }
        toggleShowMfa.on();
        setMfaSuccessCallback(() => () => handleSelectOrganization(organization));
        return;
      }

      if (callbackPort) {
        let error: string | null = null;

        if (!user?.email) error = "User email not found";
        if (!token) error = "No token found";

        if (error) {
          createNotification({
            text: error,
            type: "error"
          });
          return;
        }

        const payload = {
          JTWToken: token,
          email: user?.email,
          privateKey: ""
        } as IsCliLoginSuccessful["loginResponse"];

        // send request to server endpoint
        const instance = axios.create();
        await instance.post(`http://127.0.0.1:${callbackPort}/`, payload).catch(() => {
          // if error happens to communicate we set the token with an expiry in sessino storage
          // the cli-redirect page has logic to show this to user and ask them to paste it in terminal
          sessionStorage.setItem(
            SessionStorageKeys.CLI_TERMINAL_TOKEN,
            JSON.stringify({
              expiry: formatISO(addSeconds(new Date(), 30)),
              data: window.btoa(JSON.stringify(payload))
            })
          );
        });
        navigate({ to: "/cli-redirect" });
        // cli page
      } else {
        navigateUserToOrg({ navigate, organizationId: organization.id });
      }
    },
    [selectOrg]
  );

  const handleCliRedirect = useCallback(() => {
    const authToken = getAuthToken();

    if (authToken && !callbackPort) {
      const decodedJwt = jwtDecode(authToken) as any;

      if (decodedJwt?.organizationId) {
        navigateUserToOrg({ navigate, organizationId: decodedJwt.organizationId });
      }
    }

    if (!isLoggedIn()) {
      navigate({ to: "/login" });
    }
  }, []);

  useEffect(() => {
    if (callbackPort) {
      handleCliRedirect();
    }
  }, [navigate]);

  useEffect(() => {
    if (organizations.isPending || !organizations.data) return;

    // Case: User has no organizations.
    // This can happen if the user was previously a member, but the organization was deleted or the user was removed.
    if (organizations.data.length === 0) {
      navigate({ to: "/organizations/none" });
    } else if (organizations.data.length === 1) {
      if (callbackPort) {
        handleCliRedirect();
        setIsInitialOrgCheckLoading(false);
      } else {
        handleSelectOrganization(organizations.data[0]);
      }
    } else {
      setIsInitialOrgCheckLoading(false);
    }
  }, [organizations.isPending, organizations.data]);

  useEffect(() => {
    if (mfaPending && defaultSelectedOrg) {
      const storedMfaToken = sessionStorage.getItem(SessionStorageKeys.MFA_TEMP_TOKEN);
      if (storedMfaToken) {
        sessionStorage.removeItem(SessionStorageKeys.MFA_TEMP_TOKEN);
        SecurityClient.setMfaToken(storedMfaToken);
        setIsInitialOrgCheckLoading(false);
        toggleShowMfa.on();
        setMfaSuccessCallback(() => () => handleSelectOrganization(defaultSelectedOrg));
        return;
      }
    }

    if (defaultSelectedOrg) {
      handleSelectOrganization(defaultSelectedOrg);
    }
  }, [defaultSelectedOrg, mfaPending]);

  if (
    userLoading ||
    !user ||
    ((isInitialOrgCheckLoading || defaultSelectedOrg) && !shouldShowMfa)
  ) {
    return (
      <div className="h-screen w-screen bg-bunker-800">
        <ContentLoader />
      </div>
    );
  }

  return (
    <div className="flex max-h-screen min-h-screen flex-col justify-center overflow-y-auto bg-linear-to-tr from-mineshaft-600 via-mineshaft-800 to-bunker-700">
      <Helmet>
        <title>{t("common.head-title", { title: t("login.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content={t("login.og-title") ?? ""} />
        <meta name="og:description" content={t("login.og-description") ?? ""} />
      </Helmet>
      {shouldShowMfa ? (
        <Mfa
          email={user.email as string}
          successCallback={mfaSuccessCallback}
          method={requiredMfaMethod}
        />
      ) : (
        <div className="mx-auto mt-20 w-fit rounded-lg border-2 border-mineshaft-500 p-10 shadow-lg">
          <Link to="/">
            <div className="mb-4 flex justify-center">
              <img
                src="/images/gradientLogo.svg"
                style={{
                  height: "90px",
                  width: "120px"
                }}
                alt="Infisical logo"
              />
            </div>
          </Link>
          <form className="mx-auto flex w-full flex-col items-center justify-center">
            <div className="mb-8 space-y-2">
              <h1 className="bg-linear-to-b from-white to-bunker-200 bg-clip-text text-center text-2xl font-medium text-transparent">
                Choose your organization
              </h1>
              <div className="space-y-1">
                <p className="text-md text-center text-gray-500">
                  You&lsquo;re currently logged in as <strong>{user.username}</strong>
                </p>
                <p className="text-md text-center text-gray-500">
                  Not you?{" "}
                  <Button variant="link" onClick={handleLogout} className="font-medium">
                    Change account
                  </Button>
                </p>
              </div>
            </div>
            <div className="mt-2 w-1/4 min-w-[21.2rem] space-y-4 rounded-md text-center md:min-w-[25.1rem] lg:w-1/4">
              {organizations.isPending ? (
                <Spinner />
              ) : (
                organizations.data?.map((org) => (
                  // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
                  <div
                    onClick={() => handleSelectOrganization(org)}
                    key={org.id}
                    className="group flex cursor-pointer items-center justify-between rounded-md bg-mineshaft-700 px-4 py-3 text-gray-200 capitalize shadow-md transition-colors hover:bg-mineshaft-600"
                  >
                    <p className="truncate transition-colors">{org.name}</p>

                    <FontAwesomeIcon
                      icon={faArrowRight}
                      className="text-gray-400 transition-all group-hover:translate-x-2 group-hover:text-primary-500"
                    />
                  </div>
                ))
              )}
            </div>
          </form>
        </div>
      )}
      <div className="pb-28" />
    </div>
  );
};
