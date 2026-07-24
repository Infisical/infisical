import { useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
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
import { LoginMethod } from "@app/hooks/api/admin/types";
import { getLastLoginIdentifier, useLastLogin } from "@app/hooks/useLastLogin";

const workEmailSchema = z.string().trim().email();

type Props = {
  type: "SAML" | "OIDC";
};

export const LoginSsoPage = ({ type }: Props) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { lastLogin, saveLastLogin } = useLastLogin();
  const queryParams = new URLSearchParams(window.location.search);
  const callbackPort = queryParams.get("callback_port");
  const isAdminLogin = queryParams.get("is_admin_login") === "true";
  const organizationSlug = queryParams.get("organizationSlug") || undefined;
  const method = type === "SAML" ? LoginMethod.SAML : LoginMethod.OIDC;
  const previousIdentifier =
    lastLogin?.method === method ? getLastLoginIdentifier(lastLogin) : null;
  const initialEmail = previousIdentifier?.type === "email" ? previousIdentifier.value : "";
  const [workEmail, setWorkEmail] = useState(initialEmail);

  const handleLogin = () => {
    const domain = workEmail.trim().split("@")[1]?.toLowerCase();
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

  const canSubmit = Boolean(organizationSlug) || workEmailSchema.safeParse(workEmail).success;
  const loginPath = isAdminLogin ? "/login/admin" : "/login";

  return (
    <AuthPageLayout variant="focused">
      <Helmet>
        <title>{t("common.head-title", { title: `${type} Login` })}</title>
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
                {type} Login
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {!organizationSlug && (
              <Field>
                <FieldLabel htmlFor={`${type.toLowerCase()}-work-email`}>Work Email</FieldLabel>
                <Input
                  id={`${type.toLowerCase()}-work-email`}
                  value={workEmail}
                  onChange={(event) => setWorkEmail(event.target.value)}
                  type="email"
                  placeholder="you@company.com"
                  autoComplete="email"
                  className="h-10"
                />
              </Field>
            )}
            <Button
              variant="project"
              size="lg"
              isFullWidth
              isDisabled={!canSubmit}
              onClick={handleLogin}
            >
              Continue with {type}
            </Button>
          </CardContent>
        </AuthPagePanel>
      </div>
    </AuthPageLayout>
  );
};
