import { useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";

import { AuthPageLayout } from "@app/components/auth/AuthPageLayout";
import { AuthPagePanel } from "@app/components/auth/AuthPagePanel";
import { createNotification } from "@app/components/notifications";
import { Button, CardContent, CardHeader, CardTitle, IconButton, Input } from "@app/components/v3";
import { useServerConfig } from "@app/context";
import { LoginMethod } from "@app/hooks/api/admin/types";
import { loginLDAPRedirect } from "@app/hooks/api/auth/queries";
import { getLastLoginOrganizationSlug, useLastLogin } from "@app/hooks/useLastLogin";

export const LoginLdapPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { config } = useServerConfig();
  const { lastLogin, saveLastLogin } = useLastLogin();
  const {
    callback_port: callbackPort,
    is_admin_login: isAdminLogin,
    organizationSlug: passedOrgSlug,
    username: passedUsername
  } = useSearch({ from: "/_restrict-login-signup/login/ldap" });

  const lastLoginSlug = getLastLoginOrganizationSlug(lastLogin) || "";

  const [organizationSlug, setOrganizationSlug] = useState(
    config.defaultAuthOrgSlug || passedOrgSlug || lastLoginSlug
  );
  const [username, setUsername] = useState(passedUsername || "");
  const [password, setPassword] = useState("");
  const isFormValid = Boolean(organizationSlug.trim() && username.trim() && password);

  const handleBackToLogin = () => navigate({ to: isAdminLogin ? "/login/admin" : "/login" });

  const handleSubmission = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { nextUrl } = await loginLDAPRedirect({
        organizationSlug,
        username,
        password,
        callbackPort
      });

      if (!nextUrl) {
        createNotification({
          text: "Login unsuccessful. Double-check your credentials and try again.",
          type: "error"
        });

        return;
      }

      saveLastLogin({ method: LoginMethod.LDAP, organizationSlug });

      createNotification({
        text: "Successfully logged in",
        type: "success"
      });

      window.open(nextUrl);
      window.close();
    } catch {
      createNotification({
        text: "Login unsuccessful. Double-check your credentials and try again.",
        type: "error"
      });
    }
  };

  return (
    <AuthPageLayout>
      <Helmet>
        <title>{t("common.head-title", { title: t("login.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content={t("login.og-title") ?? ""} />
        <meta name="og:description" content={t("login.og-description") ?? ""} />
      </Helmet>
      <form onSubmit={handleSubmission} className="mx-auto w-full max-w-sm">
        <AuthPagePanel>
          <CardHeader className="mb-4 gap-4">
            <div className="flex items-center gap-1.5">
              <IconButton
                aria-label="Back to login"
                variant="ghost-muted"
                size="xs"
                className="-ml-2"
                onClick={handleBackToLogin}
              >
                <ChevronLeft />
              </IconButton>
              <CardTitle className="ml-0.5 bg-linear-to-b from-white to-bunker-200 bg-clip-text font-alliance text-2xl font-normal text-transparent">
                LDAP Login
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {!config.defaultAuthOrgSlug && !passedOrgSlug && (
              <Input
                value={organizationSlug}
                onChange={(e) => setOrganizationSlug(e.target.value)}
                type="text"
                placeholder="Enter your organization slug..."
                required
                className="h-10"
              />
            )}
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              type="text"
              placeholder="Enter your LDAP username..."
              required
              disabled={passedUsername !== undefined}
              className="h-10"
            />
            <Input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              placeholder="Enter your LDAP password..."
              required
              autoComplete="current-password"
              className="h-10"
            />
            <Button type="submit" variant="project" size="lg" isFullWidth isDisabled={!isFormValid}>
              Continue with LDAP
            </Button>
          </CardContent>
        </AuthPagePanel>
      </form>
    </AuthPageLayout>
  );
};
