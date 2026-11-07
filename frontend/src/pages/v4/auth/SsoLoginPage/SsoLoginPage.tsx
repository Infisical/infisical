import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import { Button } from "@app/components/v4/ui/button";
import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import { Stack } from "@app/components/v4/ui/layout";
import { LoginMethod } from "@app/hooks/api/admin/types";
import { getLastLoginIdentifier, useLastLogin } from "@app/hooks/useLastLogin";

import { AuthPage } from "../components/AuthPage";
import { useAuthPreview } from "../preview";

const workEmailSchema = z.string().trim().email();

export const SsoLoginPage = ({ type }: { type: "SAML" | "OIDC" }) => {
  const navigate = useNavigate();
  const preview = useAuthPreview();
  const { lastLogin, saveLastLogin } = useLastLogin();
  const queryParams = new URLSearchParams(window.location.search);
  const callbackPort = queryParams.get("callback_port");
  const isAdminLogin = queryParams.get("is_admin_login") === "true";
  const organizationSlug = queryParams.get("organizationSlug") || undefined;
  const method = type === "SAML" ? LoginMethod.SAML : LoginMethod.OIDC;
  const previousIdentifier =
    lastLogin?.method === method ? getLastLoginIdentifier(lastLogin) : null;
  const [workEmail, setWorkEmail] = useState(
    previousIdentifier?.type === "email" ? previousIdentifier.value : ""
  );

  const handleLogin = () => {
    if (preview) return;
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
      const query = callbackPort ? `?callback_port=${encodeURIComponent(callbackPort)}` : "";
      window.location.assign(`/api/v1/sso/redirect/saml2/organizations/${identifierPath}${query}`);
      return;
    }

    const query = new URLSearchParams({
      [organizationSlug ? "orgSlug" : "domain"]: organizationSlug || (domain as string)
    });
    if (callbackPort) query.set("callbackPort", callbackPort);
    window.location.assign(`/api/v1/sso/oidc/login?${query.toString()}`);
  };

  const canSubmit = Boolean(organizationSlug) || workEmailSchema.safeParse(workEmail).success;

  return (
    <AuthPage
      pageTitle={`${type} Login`}
      title={`Log in with ${type}`}
      titleAction={
        <Button
          type="button"
          variant="link"
          onClick={() => navigate({ to: isAdminLogin ? "/v4/login/admin" : "/v4/login" })}
        >
          Back
        </Button>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) handleLogin();
        }}
      >
        <Stack gap={16}>
          {!organizationSlug && (
            <Field label="Work email">
              <Input
                type="email"
                size="lg"
                value={workEmail}
                onChange={(event) => setWorkEmail(event.target.value)}
                placeholder="you@company.com"
                autoComplete="email"
              />
            </Field>
          )}
          <Button type="submit" variant="accent" size="lg" className="w-full" disabled={!canSubmit}>
            Continue with {type}
          </Button>
        </Stack>
      </form>
    </AuthPage>
  );
};
