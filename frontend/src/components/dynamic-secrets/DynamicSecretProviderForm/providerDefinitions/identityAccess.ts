import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import type { TRegisteredDynamicSecretProviderDefinition } from "../registry";
import { defineDynamicSecretProviderModule } from "../registry";
import { awsIamDynamicSecretProvider } from "./awsIam";
import { azureEntraIdDynamicSecretProvider } from "./azureEntraId";
import { gcpIamDynamicSecretProvider } from "./gcpIam";
import { githubDynamicSecretProvider } from "./github";
import { IDENTITY_ACCESS_DYNAMIC_SECRET_PROVIDERS } from "./identityAccessContract";
import { ldapDynamicSecretProvider } from "./ldap";
import { sshDynamicSecretProvider } from "./ssh";
import { tailscaleDynamicSecretProvider } from "./tailscale";

const definitionsByProvider = {
  [DynamicSecretProviders.AwsIam]: awsIamDynamicSecretProvider,
  [DynamicSecretProviders.GcpIam]: gcpIamDynamicSecretProvider,
  [DynamicSecretProviders.AzureEntraId]: azureEntraIdDynamicSecretProvider,
  [DynamicSecretProviders.Github]: githubDynamicSecretProvider,
  [DynamicSecretProviders.Tailscale]: tailscaleDynamicSecretProvider,
  [DynamicSecretProviders.Ssh]: sshDynamicSecretProvider,
  [DynamicSecretProviders.Ldap]: ldapDynamicSecretProvider
} satisfies Record<
  (typeof IDENTITY_ACCESS_DYNAMIC_SECRET_PROVIDERS)[number],
  TRegisteredDynamicSecretProviderDefinition
>;

export const identityAccessDynamicSecretProviders = defineDynamicSecretProviderModule({
  id: "identity-access",
  definitions: IDENTITY_ACCESS_DYNAMIC_SECRET_PROVIDERS.map(
    (provider) => definitionsByProvider[provider]
  )
});
