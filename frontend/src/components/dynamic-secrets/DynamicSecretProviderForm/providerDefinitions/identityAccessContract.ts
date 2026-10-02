import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

/** Providers owned by the identity/access rollout batch. */
export const IDENTITY_ACCESS_DYNAMIC_SECRET_PROVIDERS = [
  DynamicSecretProviders.AwsIam,
  DynamicSecretProviders.GcpIam,
  DynamicSecretProviders.AzureEntraId,
  DynamicSecretProviders.Github,
  DynamicSecretProviders.Tailscale,
  DynamicSecretProviders.Ssh,
  DynamicSecretProviders.Ldap
] as const;
