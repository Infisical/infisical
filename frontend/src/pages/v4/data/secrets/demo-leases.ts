import { getDynamicSecretProviderRuntimeMetadata } from "@app/components/dynamic-secrets/DynamicSecretProviderForm/runtimeMetadata";
import type { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

const token = () => Math.random().toString(36).slice(2, 10);

const fakeOutputValue = (key: string, name: string, expireAt: string) => {
  const upper = key.toUpperCase();
  if (upper === "DN_ARRAY") return [`cn=fake-${name}-${token()},ou=users,dc=example,dc=com`];
  if (upper === "EXPIRES_AT") return expireAt;
  if (upper === "TOKEN_TYPE") return "Bearer";
  if (upper === "SCOPE") return "fake-scope";
  if (upper.includes("EMAIL")) return `fake-${token()}@example.com`;
  if (upper.includes("USERNAME") || upper === "USERNAME") return `fake-${name}-${token()}`;
  return `fake-${token()}${token()}`;
};

const OPTIONAL_SHOWN = new Set(["USERNAME", "KEY_ID", "AUTH_KEY", "TOKEN_TYPE", "EXPIRES_AT"]);

export const fakeLeaseData = (
  provider: DynamicSecretProviders,
  name: string,
  expireAt: string,
  config?: Record<string, unknown>
): Record<string, unknown> => {
  const { output } = getDynamicSecretProviderRuntimeMetadata(provider).leaseCapabilities;
  if (output.type === "totp")
    return {
      TOTP: `fake-${String(Math.floor(Math.random() * 1000000)).padStart(6, "0")}`,
      TIME_REMAINING: 30 - (Math.floor(Date.now() / 1000) % 30)
    };
  if (output.type === "ssh")
    return {
      PRIVATE_KEY: `fake-private-key-${token()}${token()}`,
      SIGNED_KEY: `fake-ssh-cert-${token()}${token()} ${String(
        (config?.principals as string[] | undefined)?.[0] ?? name
      )}`
    };
  return Object.fromEntries(
    output.fields
      .filter((field) => !field.isOptional || OPTIONAL_SHOWN.has(field.key))
      .map((field) => [field.key, fakeOutputValue(field.key, name, expireAt)])
  );
};

