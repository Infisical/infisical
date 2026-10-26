import type { Resource } from "../../secrets-model";
import {
  rotationParameters,
  type RotationResource,
  rotationSecrets,
  rotationTypeOf
} from "../flows/secret-rotation/model";
import { SecretRotation } from "../flows/secret-rotation/schemas";

export type CredentialField = {
  field: string;
  label: string;
  sensitive?: boolean;
  stable?: boolean;
};

const USERNAME_PASSWORD: CredentialField[] = [
  { field: "username", label: "Username", stable: true },
  { field: "password", label: "Password", sensitive: true }
];
const CLIENT_SECRET: CredentialField[] = [
  { field: "clientId", label: "Client ID", stable: true },
  { field: "clientSecret", label: "Client Secret", sensitive: true }
];
const ACCESS_KEY_PAIR: CredentialField[] = [
  { field: "accessKeyId", label: "Access Key ID" },
  { field: "secretAccessKey", label: "Secret Access Key", sensitive: true }
];
const API_KEY: CredentialField[] = [{ field: "apiKey", label: "API Key", sensitive: true }];

export const CREDENTIAL_FIELDS: Record<SecretRotation, CredentialField[]> = {
  [SecretRotation.PostgresCredentials]: USERNAME_PASSWORD,
  [SecretRotation.MsSqlCredentials]: USERNAME_PASSWORD,
  [SecretRotation.MySqlCredentials]: USERNAME_PASSWORD,
  [SecretRotation.OracleDBCredentials]: USERNAME_PASSWORD,
  [SecretRotation.MongoDBCredentials]: USERNAME_PASSWORD,
  [SecretRotation.RedisCredentials]: USERNAME_PASSWORD,
  [SecretRotation.UnixLinuxLocalAccount]: USERNAME_PASSWORD,
  [SecretRotation.WindowsLocalAccount]: USERNAME_PASSWORD,
  [SecretRotation.HpIloLocalAccount]: USERNAME_PASSWORD,
  [SecretRotation.Auth0ClientSecret]: CLIENT_SECRET,
  [SecretRotation.AzureClientSecret]: CLIENT_SECRET,
  [SecretRotation.OktaClientSecret]: CLIENT_SECRET,
  [SecretRotation.DatabricksServicePrincipalSecret]: CLIENT_SECRET,
  [SecretRotation.LdapPassword]: [
    { field: "dn", label: "DN/UPN", stable: true },
    { field: "password", label: "Password", sensitive: true }
  ],
  [SecretRotation.AwsIamUserSecret]: ACCESS_KEY_PAIR,
  [SecretRotation.CloudflareR2AccessKey]: ACCESS_KEY_PAIR,
  [SecretRotation.CloudflareApiToken]: [
    { field: "tokenId", label: "Token ID" },
    { field: "apiToken", label: "API Token", sensitive: true }
  ],
  [SecretRotation.ConvexAccessKey]: [{ field: "accessKey", label: "Access Key", sensitive: true }],
  [SecretRotation.DatadogApiKey]: [
    { field: "apiKeyId", label: "API Key ID" },
    { field: "apiKey", label: "API Key", sensitive: true }
  ],
  [SecretRotation.DatadogApplicationKeySecret]: [
    { field: "applicationKeyId", label: "Application Key ID" },
    { field: "applicationKey", label: "Application Key", sensitive: true }
  ],
  [SecretRotation.DbtServiceToken]: [
    { field: "tokenName", label: "Token Name", stable: true },
    { field: "tokenId", label: "Token ID" },
    { field: "serviceToken", label: "Service Token" }
  ],
  [SecretRotation.FireworksApiKey]: API_KEY,
  [SecretRotation.LiteLLMApiKey]: API_KEY,
  [SecretRotation.OpenAIServiceAccount]: API_KEY,
  [SecretRotation.OpenRouterApiKey]: API_KEY,
  [SecretRotation.SupabaseApiKey]: API_KEY,
  [SecretRotation.GcpServiceAccountKey]: [
    { field: "keyId", label: "Key ID" },
    { field: "serviceAccountKey", label: "Service Account Key", sensitive: true }
  ],
  [SecretRotation.SalesforceOauthCredentials]: [
    { field: "consumerKey", label: "Consumer Key", sensitive: true, stable: true },
    { field: "consumerSecret", label: "Consumer Secret", sensitive: true }
  ],
  [SecretRotation.SnowflakeUserKeyPair]: [
    { field: "publicKey", label: "Public Key" },
    { field: "privateKey", label: "Private Key", sensitive: true }
  ],
  [SecretRotation.StripeApiKey]: [
    { field: "keyId", label: "Key ID" },
    { field: "apiKey", label: "API Key", sensitive: true }
  ]
};

const kebab = (value: string) => value.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

const fakeValue = (field: string) => `fake-${kebab(field)}-${crypto.randomUUID().slice(0, 8)}`;

export type GeneratedCredentials = {
  active: Record<string, string>;
  retired?: Record<string, string>;
};

export const credentialsOf = (
  rotation: RotationResource,
  resources: readonly Resource[]
): GeneratedCredentials => {
  if (rotation.generatedCredentials?.length) {
    const activeIndex = rotation.activeIndex ?? 0;
    return {
      active: rotation.generatedCredentials[activeIndex] ?? {},
      retired: rotation.generatedCredentials[activeIndex === 0 ? 1 : 0]
    };
  }
  const secrets = rotationSecrets(rotation, resources);
  return {
    active: Object.fromEntries(
      CREDENTIAL_FIELDS[rotationTypeOf(rotation)].map(({ field }) => {
        const value = secrets[field]?.value;
        return [
          field,
          value?.status === "present" ? value.value : `fake-${kebab(field)}-${rotation.name}`
        ];
      })
    )
  };
};

export const rotatedCredentials = (
  rotation: RotationResource,
  resources: readonly Resource[],
  current: Record<string, string>
) => {
  const { username1, username2 } = rotationParameters(rotation, resources);
  const alternates =
    typeof username1 === "string" && typeof username2 === "string" ? [username1, username2] : null;
  return Object.fromEntries(
    CREDENTIAL_FIELDS[rotationTypeOf(rotation)].map(({ field, stable }) => {
      if (field === "username" && alternates)
        return [field, current.username === alternates[0] ? alternates[1] : alternates[0]];
      if (stable && current[field]) return [field, current[field]];
      return [field, fakeValue(field)];
    })
  );
};
