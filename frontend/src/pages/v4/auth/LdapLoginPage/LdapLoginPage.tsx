import { useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { Button } from "@app/components/v4/ui/button";
import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import { Stack } from "@app/components/v4/ui/layout";
import { toast } from "@app/components/v4/ui/sonner";
import { useServerConfig } from "@app/context";
import { LoginMethod } from "@app/hooks/api/admin/types";
import { loginLDAPRedirect } from "@app/hooks/api/auth/queries";
import { getLastLoginOrganizationSlug, useLastLogin } from "@app/hooks/useLastLogin";

import { AuthPage } from "../components/AuthPage";
import { PasswordInput } from "../components/PasswordInput";
import { useAuthPreview } from "../preview";

const LOGIN_ERROR = "Login unsuccessful. Double-check your credentials and try again.";

export const LdapLoginPage = () => {
  const navigate = useNavigate();
  const preview = useAuthPreview();
  const { config } = useServerConfig();
  const { lastLogin, saveLastLogin } = useLastLogin();
  const {
    callback_port: callbackPort,
    is_admin_login: isAdminLogin,
    organizationSlug: passedOrgSlug,
    username: passedUsername
  } = useSearch({ from: "/v4/_v4-auth/login/ldap" });

  const [organizationSlug, setOrganizationSlug] = useState(
    config.defaultAuthOrgSlug || passedOrgSlug || getLastLoginOrganizationSlug(lastLogin) || ""
  );
  const [username, setUsername] = useState(passedUsername || "");
  const [password, setPassword] = useState("");
  const isFormValid = Boolean(organizationSlug.trim() && username.trim() && password);

  const handleSubmission = async (event: React.FormEvent) => {
    event.preventDefault();
    if (preview) return;
    try {
      const { nextUrl } = await loginLDAPRedirect({
        organizationSlug,
        username,
        password,
        callbackPort
      });
      if (!nextUrl) {
        toast.error(LOGIN_ERROR);
        return;
      }
      saveLastLogin({ method: LoginMethod.LDAP, organizationSlug });
      toast.success("Successfully logged in");
      window.open(nextUrl);
      window.close();
    } catch {
      toast.error(LOGIN_ERROR);
    }
  };

  return (
    <AuthPage
      pageTitle="Login"
      title="Log in with LDAP"
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
      <form onSubmit={handleSubmission}>
        <Stack gap={16}>
          {!config.defaultAuthOrgSlug && !passedOrgSlug && (
            <Field label="Organization slug">
              <Input
                size="lg"
                value={organizationSlug}
                onChange={(event) => setOrganizationSlug(event.target.value)}
                required
              />
            </Field>
          )}
          <Field label="Username">
            <Input
              size="lg"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              required
              readOnly={passedUsername !== undefined}
            />
          </Field>
          <Field label="Password">
            <PasswordInput
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>
          <Button
            type="submit"
            variant="accent"
            size="lg"
            className="w-full"
            disabled={!isFormValid}
          >
            Continue with LDAP
          </Button>
        </Stack>
      </form>
    </AuthPage>
  );
};
