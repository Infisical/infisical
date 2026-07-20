import { useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { ChevronLeft, Users } from "lucide-react";
import { z } from "zod";

import { AuthPageLayout } from "@app/components/auth/AuthPageLayout";
import { AuthPagePanel } from "@app/components/auth/AuthPagePanel";
import {
  Button,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  FieldLabel,
  IconButton,
  Input
} from "@app/components/v3";
import { useServerConfig } from "@app/context";
import { LoginMethod } from "@app/hooks/api/admin/types";
import {
  getLastLoginIdentifier,
  LEGACY_GENERIC_SSO_LOGIN_METHOD,
  useLastLogin
} from "@app/hooks/useLastLogin";

const workEmailSchema = z.string().trim().email();

export const LoginSsoPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { config } = useServerConfig();
  const { lastLogin, saveLastLogin } = useLastLogin();
  const {
    callback_port: callbackPort,
    is_admin_login: isAdminLogin,
    organizationSlug
  } = useSearch({ from: "/_restrict-login-signup/login/sso" });

  const isPreviousSsoLogin =
    lastLogin?.method === LEGACY_GENERIC_SSO_LOGIN_METHOD ||
    lastLogin?.method === LoginMethod.SAML ||
    lastLogin?.method === LoginMethod.OIDC;
  const previousSsoIdentifier = isPreviousSsoLogin ? getLastLoginIdentifier(lastLogin) : undefined;
  const initialEmail = previousSsoIdentifier?.type === "email" ? previousSsoIdentifier.value : "";
  const [workEmail, setWorkEmail] = useState(initialEmail);

  const shouldDisplayLoginMethod = (method: LoginMethod) =>
    isAdminLogin || !config.enabledLoginMethods || config.enabledLoginMethods.includes(method);

  const shouldDisplaySaml = shouldDisplayLoginMethod(LoginMethod.SAML);
  const shouldDisplayOidc = shouldDisplayLoginMethod(LoginMethod.OIDC);
  const shouldDisplayLdap = shouldDisplayLoginMethod(LoginMethod.LDAP);
  const shouldDisplayFederatedSso = shouldDisplaySaml || shouldDisplayOidc;
  const needsWorkEmail = !organizationSlug && shouldDisplayFederatedSso;
  const isWorkEmailValid = workEmailSchema.safeParse(workEmail).success;

  const getWorkEmailDomain = () => workEmail.trim().split("@")[1]?.toLowerCase();

  const handleSsoLogin = (method: LoginMethod.SAML | LoginMethod.OIDC) => {
    const domain = getWorkEmailDomain();
    if (!organizationSlug && !domain) return;

    saveLastLogin({
      method,
      identifier: {
        type: organizationSlug ? "orgSlug" : "email",
        value: organizationSlug || workEmail.trim()
      }
    });

    if (method === LoginMethod.SAML) {
      const identifierPath = organizationSlug
        ? encodeURIComponent(organizationSlug)
        : `domain/${encodeURIComponent(domain as string)}`;
      const query = callbackPort
        ? `?callback_port=${encodeURIComponent(String(callbackPort))}`
        : "";
      window.location.assign(`/api/v1/sso/redirect/saml2/organizations/${identifierPath}${query}`);
      return;
    }

    const query = new URLSearchParams({
      [organizationSlug ? "orgSlug" : "domain"]: organizationSlug || (domain as string)
    });
    if (callbackPort) query.set("callbackPort", String(callbackPort));
    window.location.assign(`/api/v1/sso/oidc/login?${query.toString()}`);
  };

  const handleLdapLogin = () => {
    navigate({
      to: "/login/ldap",
      search: {
        callback_port: callbackPort,
        is_admin_login: isAdminLogin || undefined,
        organizationSlug: organizationSlug || "",
        username: undefined
      }
    });
  };

  const canSubmitSso = Boolean(organizationSlug) || isWorkEmailValid;
  const loginPath = isAdminLogin ? "/login/admin" : "/login";

  return (
    <AuthPageLayout>
      <Helmet>
        <title>{t("common.head-title", { title: "SSO Login" })}</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content={t("login.og-title") ?? ""} />
        <meta name="og:description" content={t("login.og-description") ?? ""} />
      </Helmet>
      <div className="mx-auto flex w-full flex-col items-center justify-center">
        <AuthPagePanel>
          <CardHeader className="mb-6 gap-2">
            <div className="flex items-center gap-1.5">
              <IconButton
                aria-label="Back to login"
                variant="ghost-muted"
                size="xs"
                className="-ml-2"
                onClick={() => navigate({ to: loginPath })}
              >
                <ChevronLeft />
              </IconButton>
              <CardTitle className="ml-0.5 bg-linear-to-b from-white to-bunker-200 bg-clip-text font-alliance text-2xl font-normal text-transparent">
                Single Sign-On
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {needsWorkEmail && (
              <Field>
                <FieldLabel htmlFor="sso-work-email">Work Email</FieldLabel>
                <Input
                  id="sso-work-email"
                  value={workEmail}
                  onChange={(event) => setWorkEmail(event.target.value)}
                  type="email"
                  placeholder="you@company.com"
                  autoComplete="email"
                  className="h-10"
                />
              </Field>
            )}

            <div className="flex flex-col gap-2">
              {shouldDisplayFederatedSso && (
                <div className="flex flex-col gap-2">
                  {shouldDisplaySaml && (
                    <Button
                      variant="project"
                      size="lg"
                      isFullWidth
                      isDisabled={!canSubmitSso}
                      onClick={() => handleSsoLogin(LoginMethod.SAML)}
                    >
                      Continue with SAML
                    </Button>
                  )}
                  {shouldDisplayOidc && (
                    <Button
                      variant="project"
                      size="lg"
                      isFullWidth
                      isDisabled={!canSubmitSso}
                      onClick={() => handleSsoLogin(LoginMethod.OIDC)}
                    >
                      Continue with OIDC
                    </Button>
                  )}
                </div>
              )}
              {shouldDisplayLdap && (
                <Button variant="outline" size="lg" isFullWidth onClick={handleLdapLogin}>
                  <Users />
                  Continue with LDAP
                </Button>
              )}
            </div>
          </CardContent>
        </AuthPagePanel>
      </div>
    </AuthPageLayout>
  );
};
