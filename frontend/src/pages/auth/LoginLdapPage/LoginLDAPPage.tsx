import { useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "@tanstack/react-router";

import { AuthPageBackground } from "@app/components/auth/AuthPageBackground";
import { AuthPageFooter } from "@app/components/auth/AuthPageFooter";
import { createNotification } from "@app/components/notifications";
import {
  Button,
  UnstableCard,
  UnstableCardContent,
  UnstableCardHeader,
  UnstableCardTitle,
  UnstableInput
} from "@app/components/v3";
import { useServerConfig } from "@app/context";
import { LoginMethod } from "@app/hooks/api/admin/types";
import { loginLDAPRedirect } from "@app/hooks/api/auth/queries";
import { useLastLogin } from "@app/hooks/useLastLogin";

export const LoginLdapPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { config } = useServerConfig();
  const { lastLogin, saveLastLogin } = useLastLogin();
  const queryParams = new URLSearchParams(window.location.search);
  const passedOrgSlug = queryParams.get("organizationSlug");
  const passedUsername = queryParams.get("username");

  const lastLoginSlug =
    lastLogin?.method === LoginMethod.LDAP && lastLogin.orgSlug ? lastLogin.orgSlug : "";

  const [organizationSlug, setOrganizationSlug] = useState(
    config.defaultAuthOrgSlug || passedOrgSlug || lastLoginSlug
  );
  const [username, setUsername] = useState(passedUsername || "");
  const [password, setPassword] = useState("");

  const handleSubmission = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { nextUrl } = await loginLDAPRedirect({
        organizationSlug,
        username,
        password
      });

      if (!nextUrl) {
        createNotification({
          text: "Login unsuccessful. Double-check your credentials and try again.",
          type: "error"
        });

        return;
      }

      saveLastLogin({ method: LoginMethod.LDAP, orgSlug: organizationSlug });

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
    <div className="relative flex max-h-screen min-h-screen flex-col justify-center overflow-y-auto bg-linear-to-tr from-card via-bunker-900 to-card px-6">
      <AuthPageBackground />
      <Helmet>
        <title>{t("common.head-title", { title: t("login.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content={t("login.og-title") ?? ""} />
        <meta name="og:description" content={t("login.og-description") ?? ""} />
      </Helmet>
      <div className="relative z-10 my-auto flex flex-col items-center py-10">
        <Link to="/">
          <div className="mb-4 flex justify-center">
            <img
              src="/images/gradientLogo.svg"
              style={{ height: "90px", width: "120px" }}
              alt="Infisical logo"
            />
          </div>
        </Link>
        <form onSubmit={handleSubmission} className="mx-auto w-full max-w-sm">
          <UnstableCard className="w-full items-stretch gap-0 p-6">
            <UnstableCardHeader className="mb-4 gap-4">
              <UnstableCardTitle className="ml-0.5 bg-linear-to-b from-white to-bunker-200 bg-clip-text text-[1.35rem] font-medium text-transparent">
                LDAP Login
              </UnstableCardTitle>
            </UnstableCardHeader>
            <UnstableCardContent>
              {!config.defaultAuthOrgSlug && !passedOrgSlug && (
                <div className="w-full">
                  <UnstableInput
                    value={organizationSlug}
                    onChange={(e) => setOrganizationSlug(e.target.value)}
                    type="text"
                    placeholder="Enter your organization slug..."
                    required
                    className="h-10"
                  />
                </div>
              )}
              <div className="mt-2 w-full">
                <UnstableInput
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  type="text"
                  placeholder="Enter your LDAP username..."
                  required
                  disabled={passedUsername !== null}
                  className="h-10"
                />
              </div>
              <div className="mt-2 w-full">
                <UnstableInput
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  placeholder="Enter your LDAP password..."
                  required
                  autoComplete="current-password"
                  className="h-10"
                />
              </div>
              <div className="mt-4 w-full">
                <Button type="submit" variant="project" size="lg" isFullWidth>
                  {t("login.login")}
                </Button>
              </div>
              <div className="mt-6 flex flex-row justify-center text-xs text-label">
                <button onClick={() => navigate({ to: "/login" })} type="button">
                  <span className="cursor-pointer duration-200 hover:text-foreground hover:underline hover:decoration-project/45 hover:underline-offset-2">
                    {t("login.other-option")}
                  </span>
                </button>
              </div>
            </UnstableCardContent>
          </UnstableCard>
        </form>
      </div>
      <AuthPageFooter />
    </div>
  );
};
