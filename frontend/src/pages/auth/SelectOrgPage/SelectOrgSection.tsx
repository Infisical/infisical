import { useCallback, useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { faArrowRight, faChevronRight, faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import axios from "axios";
import { addSeconds, formatISO } from "date-fns";
import { jwtDecode } from "jwt-decode";

import { Mfa } from "@app/components/auth/Mfa";
import { createNotification } from "@app/components/notifications";
import { IsCliLoginSuccessful } from "@app/components/utilities/attemptCliLogin";
import SecurityClient from "@app/components/utilities/SecurityClient";
import { Button, ContentLoader, Input, Spinner } from "@app/components/v2";
import { SessionStorageKeys } from "@app/const";
import { OrgMembershipRole } from "@app/helpers/roles";
import { useToggle } from "@app/hooks";
import {
  TOrgWithSubOrgs,
  useGetOrganizations,
  useGetOrganizationsWithSubOrgs,
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
  const orgsWithSubOrgs = useGetOrganizationsWithSubOrgs();
  const selectOrg = useSelectOrganization();
  const { data: user, isPending: userLoading } = useGetUser();
  const [shouldShowMfa, toggleShowMfa] = useToggle(false);
  const [requiredMfaMethod, setRequiredMfaMethod] = useState(MfaMethod.EMAIL);
  const [isInitialOrgCheckLoading, setIsInitialOrgCheckLoading] = useState(true);
  const [selectedRootOrg, setSelectedRootOrg] = useState<TOrgWithSubOrgs | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

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
      await logout.mutateAsync();
      navigate({ to: "/login" });
    } catch (error) {
      console.error(error);
    }
  }, [logout, navigate]);

  const filteredOrgs = useMemo(() => {
    if (!orgsWithSubOrgs.data) return [];
    if (!searchTerm.trim()) return orgsWithSubOrgs.data;

    const term = searchTerm.toLowerCase();
    return orgsWithSubOrgs.data
      .filter(
        (org) =>
          org.name.toLowerCase().includes(term) ||
          org.subOrganizations.some((sub) => sub.name.toLowerCase().includes(term))
      )
      .map((org) => ({
        ...org,
        subOrganizations: org.name.toLowerCase().includes(term)
          ? org.subOrganizations
          : org.subOrganizations.filter((sub) => sub.name.toLowerCase().includes(term))
      }));
  }, [orgsWithSubOrgs.data, searchTerm]);

  const filteredSubOrgs = useMemo(() => {
    if (!selectedRootOrg) return [];
    if (!searchTerm.trim()) return selectedRootOrg.subOrganizations;
    const term = searchTerm.toLowerCase();
    return selectedRootOrg.subOrganizations.filter((sub) => sub.name.toLowerCase().includes(term));
  }, [selectedRootOrg, searchTerm]);

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
          createNotification({ text: error, type: "error" });
          return;
        }

        const payload = {
          JTWToken: token,
          email: user?.email,
          privateKey: ""
        } as IsCliLoginSuccessful["loginResponse"];

        const instance = axios.create();
        await instance.post(`http://127.0.0.1:${callbackPort}/`, payload).catch(() => {
          sessionStorage.setItem(
            SessionStorageKeys.CLI_TERMINAL_TOKEN,
            JSON.stringify({
              expiry: formatISO(addSeconds(new Date(), 30)),
              data: window.btoa(JSON.stringify(payload))
            })
          );
        });
        navigate({ to: "/cli-redirect" });
      } else {
        navigateUserToOrg({ navigate, organizationId: organization.id });
      }
    },
    [selectOrg]
  );

  // Look up the full Organization object by ID then log in
  const handleLoginById = useCallback(
    (id: string) => {
      // Direct membership — use the full org object as-is
      const org = organizations.data?.find((o) => o.id === id);
      if (org) {
        handleSelectOrganization(org);
        return;
      }

      // Sub-org: not in the flat list, so find its root org and inherit its SSO
      // settings. Overriding only the id means selectOrganization will target the
      // sub-org while still respecting the root org's auth enforcement rules.
      const parentEntry = orgsWithSubOrgs.data?.find((rootOrg) =>
        rootOrg.subOrganizations.some((sub) => sub.id === id)
      );
      const rootOrg = parentEntry
        ? organizations.data?.find((o) => o.id === parentEntry.id)
        : undefined;

      if (rootOrg) {
        handleSelectOrganization({ ...rootOrg, id });
        return;
      }

      createNotification({ text: "Organization not found", type: "error" });
    },
    [organizations.data, orgsWithSubOrgs.data, handleSelectOrganization]
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
    if (orgsWithSubOrgs.isPending || !orgsWithSubOrgs.data) return;

    if (organizations.data.length === 0) {
      navigate({ to: "/organizations/none" });
      return;
    }

    // Only auto-select when there is exactly 1 root org and it has no accessible sub-orgs.
    // If the single org has sub-orgs the user should pick which one to log into.
    const onlyOneRootOrgWithNoSubOrgs =
      orgsWithSubOrgs.data.length === 1 && orgsWithSubOrgs.data[0].subOrganizations.length === 0;

    if (onlyOneRootOrgWithNoSubOrgs) {
      if (callbackPort) {
        handleCliRedirect();
        setIsInitialOrgCheckLoading(false);
      } else {
        handleSelectOrganization(organizations.data[0]);
      }
    } else {
      setIsInitialOrgCheckLoading(false);
    }
  }, [organizations.isPending, organizations.data, orgsWithSubOrgs.isPending, orgsWithSubOrgs.data]);

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
        <div className="mx-auto mt-20 w-full max-w-md pb-28">
          {/* Logo + heading outside the card */}
          <Link to="/">
            <div className="mb-4 flex justify-center">
              <img
                src="/images/gradientLogo.svg"
                style={{ height: "90px", width: "120px" }}
                alt="Infisical logo"
              />
            </div>
          </Link>
          <div className="mb-8 space-y-2">
            <h1 className="bg-linear-to-b from-white to-bunker-200 bg-clip-text text-center text-2xl font-medium text-transparent">
              Choose your organization
            </h1>
            <div className="space-y-1">
              <p className="text-md text-center text-gray-500">
                You&apos;re currently logged in as <strong>{user.username}</strong>
              </p>
              <p className="text-md text-center text-gray-500">
                Not you?{" "}
                <Button variant="link" onClick={handleLogout} className="font-medium">
                  Change account
                </Button>
              </p>
            </div>
          </div>

          {/* Card: search + breadcrumb + fixed-height list */}
          <div className="rounded-lg border-2 border-mineshaft-500 shadow-lg">
            <div className="border-b border-mineshaft-600 px-4 py-3">
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={selectedRootOrg ? "Search sub-organizations..." : "Search organizations..."}
                leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
                className="h-10"
              />
            </div>

            {/* Breadcrumb */}
            {selectedRootOrg && (
              <div className="border-b border-mineshaft-600 px-4 py-2">
                <nav className="flex items-center gap-1.5 text-sm">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedRootOrg(null);
                      setSearchTerm("");
                    }}
                    className="text-mineshaft-400 transition-colors hover:text-gray-200"
                  >
                    All organizations
                  </button>
                  <span className="text-mineshaft-600">›</span>
                  <span className="font-medium text-gray-300">{selectedRootOrg.name}</span>
                </nav>
              </div>
            )}

            <div className="max-h-96 overflow-y-auto p-2 thin-scrollbar">
              {orgsWithSubOrgs.isPending ? (
                <div className="flex justify-center py-6">
                  <Spinner size="sm" />
                </div>
              ) : selectedRootOrg ? (
                /* Drill-down: root org + its sub-orgs */
                <div className="space-y-2">
                  {/* Root org login row */}
                  <div className="group flex h-14 cursor-default items-center justify-between rounded-md border border-mineshaft-600 bg-mineshaft-700 px-4 text-gray-200 shadow-md transition-colors hover:bg-mineshaft-600">
                    <div className="flex flex-col items-start">
                      <p className="truncate">{selectedRootOrg.name}</p>
                      <p className="text-xs text-mineshaft-400">Root organization</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleLoginById(selectedRootOrg.id)}
                      aria-label="Login to root organization"
                      className="text-gray-400 transition-all hover:text-primary-500 group-hover:text-primary-400"
                    >
                      <FontAwesomeIcon icon={faArrowRight} />
                    </button>
                  </div>

                  {/* Sub-org rows */}
                  {filteredSubOrgs.length === 0 ? (
                    <p className="py-4 text-center text-sm text-mineshaft-400">
                      No sub-organizations found
                    </p>
                  ) : (
                    filteredSubOrgs.map((sub) => (
                      <button
                        key={sub.id}
                        type="button"
                        onClick={() => handleLoginById(sub.id)}
                        className="group flex h-14 w-full cursor-pointer items-center justify-between rounded-md border border-mineshaft-600 bg-mineshaft-800 px-4 text-gray-300 shadow-md transition-colors hover:bg-mineshaft-700"
                      >
                        <p className="truncate">{sub.name}</p>
                        <FontAwesomeIcon
                          icon={faArrowRight}
                          className="text-gray-400 transition-all group-hover:translate-x-1 group-hover:text-primary-500"
                        />
                      </button>
                    ))
                  )}
                </div>
              ) : filteredOrgs.length === 0 ? (
                <p className="py-4 text-center text-sm text-mineshaft-400">
                  No organizations found
                </p>
              ) : (
                /* Default: root org list */
                <div className="space-y-2">
                  {filteredOrgs.map((org) => {
                    const hasSubOrgs = org.subOrganizations.length > 0;
                    const isSearching = !!searchTerm.trim();

                    return (
                      <div key={org.id}>
                        <div className="group flex h-14 cursor-default items-center justify-between rounded-md border border-mineshaft-600 bg-mineshaft-700 px-4 text-gray-200 shadow-md transition-colors hover:bg-mineshaft-600">
                          <div className="flex flex-col items-start">
                            <p className="truncate transition-colors">{org.name}</p>
                            {hasSubOrgs && !isSearching && (
                              <p className="text-xs text-mineshaft-400">
                                {org.subOrganizations.length} sub-organization
                                {org.subOrganizations.length !== 1 ? "s" : ""}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => handleLoginById(org.id)}
                              aria-label="Login"
                              className="text-gray-400 transition-all hover:text-primary-500 group-hover:text-primary-400"
                            >
                              <FontAwesomeIcon icon={faArrowRight} />
                            </button>
                            {hasSubOrgs && !isSearching && (
                              <button
                                type="button"
                                onClick={() => setSelectedRootOrg(org)}
                                aria-label="View sub-organizations"
                                className="flex size-5 shrink-0 items-center justify-center text-mineshaft-400 transition-colors hover:text-gray-200"
                              >
                                <FontAwesomeIcon icon={faChevronRight} className="text-xs" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Auto-expand sub-orgs when searching */}
                        {isSearching && hasSubOrgs && (
                          <div className="mx-2 mt-1 space-y-1">
                            {org.subOrganizations.map((sub) => (
                              <button
                                key={sub.id}
                                type="button"
                                onClick={() => handleLoginById(sub.id)}
                                className="group flex h-14 w-full cursor-pointer items-center justify-between rounded-md border border-mineshaft-600 bg-mineshaft-800 px-4 text-gray-300 shadow-md transition-colors hover:bg-mineshaft-700"
                              >
                                <p className="truncate">{sub.name}</p>
                                <FontAwesomeIcon
                                  icon={faArrowRight}
                                  className="text-gray-400 transition-all group-hover:translate-x-1 group-hover:text-primary-500"
                                />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <div className="pb-28" />
    </div>
  );
};
