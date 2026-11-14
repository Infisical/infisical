import { useState } from "react";
import { Checkbox } from "@infisical/cipher/ui/checkbox";
import { Stack } from "@infisical/cipher/ui/layout";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { SettingsCard } from "@infisical/cipher/ui/settings-card";
import axios from "axios";

import { LoginMethod, SuperAdminErrorCode } from "@app/hooks/api/admin/types";

import { failed, saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";

const loginMethods = [
  { value: LoginMethod.EMAIL, label: "Email" },
  { value: LoginMethod.GOOGLE, label: "Google SSO" },
  { value: LoginMethod.GITHUB, label: "GitHub SSO" },
  { value: LoginMethod.GITLAB, label: "GitLab SSO" },
  { value: LoginMethod.SAML, label: "SAML SSO" },
  { value: LoginMethod.OIDC, label: "OIDC SSO" },
  { value: LoginMethod.LDAP, label: "LDAP" }
];

const LoginMethodsCard = ({ enabled }: { enabled: LoginMethod[] }) => {
  const update = useV4Adapter("admin").useUpdateServerConfig({
    handledErrorCodes: [SuperAdminErrorCode.AuthMethodLockout]
  });
  const [draft, setDraft] = useState(enabled);
  return (
    <SettingsCard
      title="Login methods"
      description="Available to every user of this instance."
      saveDisabledReason={draft.length ? undefined : "Enable at least one login method"}
      dirty={loginMethods.some(({ value }) => draft.includes(value) !== enabled.includes(value))}
      onDiscard={() => setDraft(enabled)}
      onSave={async () => {
        const enabledLoginMethods = Object.values(LoginMethod).filter((value) =>
          draft.includes(value)
        );
        try {
          await update.mutateAsync({ enabledLoginMethods });
        } catch (error) {
          const response = axios.isAxiosError<{ error?: string; message?: string }>(error)
            ? error.response?.data
            : undefined;
          if (response?.error === SuperAdminErrorCode.AuthMethodLockout) {
            failed("Login methods not updated", new Error(response.message));
          } else {
            failed("Login methods not updated", error);
          }
          throw error;
        }
        saved("Login methods have been successfully updated");
      }}
    >
      {loginMethods.map(({ value, label }) => (
        <Checkbox
          key={value}
          label={label}
          checked={draft.includes(value)}
          onChange={(checked) =>
            setDraft(checked ? [...draft, value] : draft.filter((entry) => entry !== value))
          }
        />
      ))}
    </SettingsCard>
  );
};

export const AuthenticationPage = () => {
  const { data: config, error } = useV4Adapter("admin").useServerConfig();
  if (error) throw error;
  const enabled = config?.enabledLoginMethods ?? loginMethods.map(({ value }) => value);
  return (
    <Stack gap={24}>
      <PageHeader title="Authentication" />
      {config ? (
        <LoginMethodsCard key={enabled.join()} enabled={enabled} />
      ) : (
        <SettingsCard title="Login methods" loading />
      )}
    </Stack>
  );
};
