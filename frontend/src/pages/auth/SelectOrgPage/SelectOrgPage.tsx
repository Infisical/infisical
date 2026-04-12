import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useRouter, useSearch } from "@tanstack/react-router";
import { addSeconds, format, formatISO } from "date-fns";
import { jwtDecode } from "jwt-decode";
import { ChevronRight, LogIn, Search } from "lucide-react";

import { Mfa } from "@app/components/auth/Mfa";
import { createNotification } from "@app/components/notifications";
import SecurityClient from "@app/components/utilities/SecurityClient";
import { Button, ContentLoader, Input, Spinner } from "@app/components/v2";
import { SessionStorageKeys } from "@app/const";
import { ROUTE_PATHS } from "@app/const/routes";
import { useToggle } from "@app/hooks";
import {
  TOrgWithSubOrgs,
  useGetOrganizationsWithSubOrgs,
  useGetUser,
  useLogoutUser,
  useSelectOrganization
} from "@app/hooks/api";
import { MfaMethod, UserAgentType } from "@app/hooks/api/auth/types";
import { getAuthToken, setAuthToken } from "@app/hooks/api/reactQuery";
import { AuthMethod, SAML_AUTH_METHODS } from "@app/hooks/api/users/types";

import { navigateUserToOrg } from "../LoginPage/Login.utils";

const OrgRow = ({
  name,
  label,
  joinedAt,
  onClick,
  variant = "default"
}: {
  name: string;
  label?: string;
  joinedAt?: string | null;
  onClick: () => void;
  variant?: "default" | "sub" | "root";
}) => {
  const bgClass =
    variant === "sub"
      ? "bg-mineshaft-800 text-gray-300 hover:bg-mineshaft-700"
      : "bg-mineshaft-700 text-gray-200 hover:bg-mineshaft-600";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Login to ${name}`}
      className={`group flex h-14 w-full cursor-pointer items-center justify-between rounded-md border border-mineshaft-600 px-4 shadow-md transition-colors ${bgClass}`}
    >
      <div className="flex flex-col items-start">
        <p className="truncate">{name}</p>
        {(label || joinedAt) && (
          <p className="text-xs text-mineshaft-400">
            {label}
            {label && joinedAt && " · "}
            {joinedAt && <>Member since {format(new Date(joinedAt), "MMM d yyyy")}</>}
          </p>
        )}
      </div>
      <LogIn className="size-4 text-gray-400 transition-all group-hover:text-primary-400" />
    </button>
  );
};

export const SelectOrgPage = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const router = useRouter();
  const search = useSearch({ from: ROUTE_PATHS.Auth.SelectOrgPage.id });

  const {
    org_id: orgId,
    callback_port: callbackPort,
    is_admin_login: isBreakglassRoute,
    mfa_method: mfaMethodFromSearch
  } = search;

  const { data: orgs, isPending: orgsLoading } = useGetOrganizationsWithSubOrgs();
  const selectOrg = useSelectOrganization();
  const { data: user, isPending: userLoading } = useGetUser();
  const logout = useLogoutUser();

  const [shouldShowMfa, toggleShowMfa] = useToggle(false);
  const [requiredMfaMethod, setRequiredMfaMethod] = useState(
    mfaMethodFromSearch ?? MfaMethod.EMAIL
  );
  const [selectedRootOrg, setSelectedRootOrg] = useState<TOrgWithSubOrgs | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const mfaOrgInfo = useRef<{ rootOrg: TOrgWithSubOrgs; subOrgId?: string } | null>(null);

  const handleLogout = useCallback(async () => {
    try {
      await logout.mutateAsync();
      navigate({ to: "/login" });
    } catch (error) {
      console.error(error);
    }
  }, [logout, navigate]);

  const filteredOrgs = useMemo(() => {
    if (!orgs) return [];
    if (!searchTerm.trim()) return orgs;

    const term = searchTerm.toLowerCase();
    return orgs
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
  }, [orgs, searchTerm]);

  const totalOrgCount = useMemo(() => {
    if (!orgs) return 0;
    return orgs.reduce((sum, org) => sum + 1 + org.subOrganizations.length, 0);
  }, [orgs]);

  const filteredSubOrgs = useMemo(() => {
    if (!selectedRootOrg) return [];
    if (!searchTerm.trim()) return selectedRootOrg.subOrganizations;
    const term = searchTerm.toLowerCase();
    return selectedRootOrg.subOrganizations.filter((sub) => sub.name.toLowerCase().includes(term));
  }, [selectedRootOrg, searchTerm]);

  // For sub-orgs, inherit the root org's SSO settings but override the ID
  const handleSelectOrganization = async (org: TOrgWithSubOrgs, subOrgId?: string) => {
    const targetOrgId = subOrgId || org.id;
    const canBypassOrgAuth = org.bypassOrgAuthEnabled && isBreakglassRoute;

    if (isBreakglassRoute && !org.bypassOrgAuthEnabled) {
      createNotification({
        text: "This organization does not have bypass org auth enabled",
        type: "error"
      });
      return;
    }

    if ((org.authEnforced || org.googleSsoAuthEnforced) && !canBypassOrgAuth) {
      const authToken = jwtDecode(getAuthToken()) as { authMethod: AuthMethod };

      let ssoRequired = false;
      let ssoType = "";

      if (org.googleSsoAuthEnforced && authToken.authMethod !== AuthMethod.GOOGLE) {
        ssoRequired = true;
        ssoType = "Google SSO";
      } else if (
        org.orgAuthMethod === AuthMethod.OIDC &&
        authToken.authMethod !== AuthMethod.OIDC
      ) {
        ssoRequired = true;
        ssoType = "OIDC SSO";
      } else if (
        org.orgAuthMethod === AuthMethod.SAML &&
        !SAML_AUTH_METHODS.includes(authToken.authMethod as (typeof SAML_AUTH_METHODS)[number])
      ) {
        ssoRequired = true;
        ssoType = "SAML SSO";
      }

      if (ssoRequired) {
        createNotification({
          text: `This organization requires ${ssoType}. Please log out and re-login via your identity provider.`,
          type: "error"
        });
        return;
      }
    }

    let token;
    let isMfaEnabled;
    let mfaMethod;

    try {
      const result = await selectOrg.mutateAsync({
        organizationId: targetOrgId,
        userAgent: callbackPort ? UserAgentType.CLI : undefined
      });
      token = result.token;
      isMfaEnabled = result.isMfaEnabled;
      mfaMethod = result.mfaMethod;
    } catch (error: any) {
      const message = error?.response?.data?.message || "Failed to select organization.";
      createNotification({ text: message, type: "error" });
      return;
    }

    await router.invalidate();

    if (isMfaEnabled) {
      SecurityClient.setMfaToken(token);
      if (mfaMethod) {
        setRequiredMfaMethod(mfaMethod);
      }
      toggleShowMfa.on();
      mfaOrgInfo.current = { rootOrg: org, subOrgId };
      return;
    }

    if (callbackPort) {
      let error: string | null = null;

      console.log(user);
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
      };

      sessionStorage.setItem(
        SessionStorageKeys.CLI_TERMINAL_TOKEN,
        JSON.stringify({
          expiry: formatISO(addSeconds(new Date(), 30)),
          data: window.btoa(JSON.stringify(payload)),
          callbackPort
        })
      );
      navigate({ to: "/cli-redirect" });
    } else {
      setAuthToken(token);
      navigateUserToOrg({ navigate, organizationId: targetOrgId });
    }
  };

  // MFA pending from IdP redirect
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const defaultOrg = orgs?.find((o) => o.id === orgId);
    const storedMfaToken = sessionStorage.getItem(SessionStorageKeys.MFA_TEMP_TOKEN);
    if (mfaMethodFromSearch && storedMfaToken && defaultOrg) {
      sessionStorage.removeItem(SessionStorageKeys.MFA_TEMP_TOKEN);
      SecurityClient.setMfaToken(storedMfaToken);
      toggleShowMfa.on();
      mfaOrgInfo.current = { rootOrg: defaultOrg };
    }
  }, [mfaMethodFromSearch, orgs?.length, orgId]);

  const renderListContent = () => {
    if (orgsLoading) {
      return (
        <div className="flex justify-center py-6">
          <Spinner size="sm" />
        </div>
      );
    }

    if (selectedRootOrg) {
      return (
        <div className="space-y-2">
          <OrgRow
            name={selectedRootOrg.name}
            label="Root organization"
            joinedAt={selectedRootOrg.userJoinedAt}
            onClick={() => handleSelectOrganization(selectedRootOrg)}
            variant="root"
          />
          <p className="px-1 pt-1 text-xs font-medium tracking-wider text-mineshaft-400 uppercase">
            Sub-organizations
          </p>
          {filteredSubOrgs.length === 0 ? (
            <p className="py-4 text-center text-sm text-mineshaft-400">
              No sub-organizations found
            </p>
          ) : (
            filteredSubOrgs.map((sub) => (
              <OrgRow
                key={sub.id}
                name={sub.name}
                joinedAt={sub.userJoinedAt}
                onClick={() => handleSelectOrganization(selectedRootOrg, sub.id)}
                variant="sub"
              />
            ))
          )}
        </div>
      );
    }

    if (filteredOrgs.length === 0) {
      return <p className="py-4 text-center text-sm text-mineshaft-400">No organizations found</p>;
    }

    const isSearching = Boolean(searchTerm.trim());
    return (
      <div className="space-y-2">
        {filteredOrgs.map((org) => {
          const hasSubOrgs = org.subOrganizations.length > 0;

          return (
            <div key={org.id}>
              {hasSubOrgs && !isSearching ? (
                <div className="relative overflow-clip rounded-md border border-mineshaft-600 text-gray-200 shadow-md">
                  <button
                    type="button"
                    onClick={() => handleSelectOrganization(org)}
                    aria-label={`Login to ${org.name}`}
                    className="group relative z-10 flex w-full cursor-pointer items-center justify-between bg-mineshaft-700 px-4 py-3 transition-colors hover:bg-mineshaft-600"
                  >
                    <div className="flex flex-col items-start gap-1.5">
                      <p className="truncate transition-colors">{org.name}</p>
                      {org.userJoinedAt && (
                        <p className="text-xs text-mineshaft-400">
                          Member since {format(new Date(org.userJoinedAt), "MMM d yyyy")}
                        </p>
                      )}
                    </div>
                    <LogIn className="size-4.5 text-gray-400 transition-all group-hover:text-primary-400" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedRootOrg(org)}
                    aria-label={`View sub-organizations of ${org.name}`}
                    className="pointer-events-auto flex w-full cursor-pointer items-center gap-1 bg-mineshaft-500 px-2 py-2 text-xs text-mineshaft-300 transition-colors hover:bg-mineshaft-500 hover:text-gray-200"
                  >
                    <ChevronRight className="size-4" />
                    View {org.subOrganizations.length} sub-organization
                    {org.subOrganizations.length !== 1 ? "s" : ""}
                  </button>
                </div>
              ) : (
                <OrgRow
                  name={org.name}
                  joinedAt={org.userJoinedAt}
                  onClick={() => handleSelectOrganization(org)}
                />
              )}

              {isSearching && hasSubOrgs && (
                <div className="mt-2 ml-1 space-y-1 border-l border-primary pl-2">
                  {org.subOrganizations.map((sub) => (
                    <OrgRow
                      key={sub.id}
                      name={sub.name}
                      label="Sub-organization"
                      joinedAt={sub.userJoinedAt}
                      onClick={() => handleSelectOrganization(org, sub.id)}
                      variant="sub"
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  if (userLoading || !user) {
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
          successCallback={() => {
            if (mfaOrgInfo.current) {
              handleSelectOrganization(mfaOrgInfo.current.rootOrg, mfaOrgInfo.current.subOrgId);
            }
          }}
          method={requiredMfaMethod as MfaMethod}
        />
      ) : (
        <div className="mx-auto mt-20 w-full max-w-md pb-28">
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

          <div className="rounded-lg border-2 border-mineshaft-500 shadow-lg">
            {totalOrgCount >= 5 && (
              <div className="border-b border-mineshaft-600 px-4 py-3">
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={
                    selectedRootOrg ? "Search sub-organizations..." : "Search organizations..."
                  }
                  leftIcon={<Search className="size-4" />}
                  className="h-10"
                />
              </div>
            )}

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
                  <span className="text-white">›</span>
                  <span className="font-medium text-gray-300">{selectedRootOrg.name}</span>
                </nav>
              </div>
            )}

            <div className="max-h-96 thin-scrollbar overflow-y-auto p-2">{renderListContent()}</div>
          </div>
        </div>
      )}
    </div>
  );
};
