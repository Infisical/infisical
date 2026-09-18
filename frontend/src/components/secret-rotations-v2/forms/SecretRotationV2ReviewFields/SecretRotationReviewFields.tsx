import { useFormContext } from "react-hook-form";
import { format } from "date-fns";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { ReviewField } from "@app/components/secret-rotations-v2/forms/shared";
import { DetailGroup, DetailGroupHeader } from "@app/components/v3";
import { getRotateAtLocal } from "@app/helpers/secretRotationsV2";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

import { Auth0ClientSecretRotationReviewFields } from "./Auth0ClientSecretRotationReviewFields";
import { AwsIamUserSecretRotationReviewFields } from "./AwsIamUserSecretRotationReviewFields";
import { AzureClientSecretRotationReviewFields } from "./AzureClientSecretRotationReviewFields";
import { CloudflareApiTokenRotationReviewFields } from "./CloudflareApiTokenRotationReviewFields";
import { CloudflareR2AccessKeyRotationReviewFields } from "./CloudflareR2AccessKeyRotationReviewFields";
import { ConvexAccessKeyRotationReviewFields } from "./ConvexAccessKeyRotationReviewFields";
import { DatabricksServicePrincipalSecretRotationReviewFields } from "./DatabricksServicePrincipalSecretRotationReviewFields";
import { DatadogApiKeyRotationReviewFields } from "./DatadogApiKeyRotationReviewFields";
import { DatadogApplicationKeySecretRotationReviewFields } from "./DatadogApplicationKeySecretRotationReviewFields";
import { DbtServiceTokenRotationReviewFields } from "./DbtServiceTokenRotationReviewFields";
import { FireworksApiKeyRotationReviewFields } from "./FireworksApiKeyRotationReviewFields";
import { HpIloRotationReviewFields } from "./HpIloRotationReviewFields";
import { LdapPasswordRotationReviewFields } from "./LdapPasswordRotationReviewFields";
import { LiteLLMApiKeyRotationReviewFields } from "./LiteLLMApiKeyRotationReviewFields";
import { OktaClientSecretRotationReviewFields } from "./OktaClientSecretRotationReviewFields";
import { OpenAIServiceAccountRotationReviewFields } from "./OpenAIServiceAccountRotationReviewFields";
import { OpenRouterApiKeyRotationReviewFields } from "./OpenRouterApiKeyRotationReviewFields";
import { RedisCredentialsRotationReviewFields } from "./RedisCredentialsRotationReviewFields";
import { SalesforceOauthCredentialsRotationReviewFields } from "./SalesforceOauthCredentialsRotationReviewFields";
import { SqlCredentialsRotationReviewFields } from "./shared";
import { SnowflakeUserKeyPairRotationReviewFields } from "./SnowflakeUserKeyPairRotationReviewFields";
import { SupabaseApiKeyRotationReviewFields } from "./SupabaseApiKeyRotationReviewFields";
import { UnixLinuxLocalAccountRotationReviewFields } from "./UnixLinuxLocalAccountRotationReviewFields";
import { WindowsLocalAccountRotationReviewFields } from "./WindowsLocalAccountRotationReviewFields";

const COMPONENT_MAP: Record<SecretRotation, React.FC> = {
  [SecretRotation.PostgresCredentials]: SqlCredentialsRotationReviewFields,
  [SecretRotation.MsSqlCredentials]: SqlCredentialsRotationReviewFields,
  [SecretRotation.MySqlCredentials]: SqlCredentialsRotationReviewFields,
  [SecretRotation.OracleDBCredentials]: SqlCredentialsRotationReviewFields,
  [SecretRotation.Auth0ClientSecret]: Auth0ClientSecretRotationReviewFields,
  [SecretRotation.AzureClientSecret]: AzureClientSecretRotationReviewFields,
  [SecretRotation.LdapPassword]: LdapPasswordRotationReviewFields,
  [SecretRotation.AwsIamUserSecret]: AwsIamUserSecretRotationReviewFields,
  [SecretRotation.OktaClientSecret]: OktaClientSecretRotationReviewFields,
  [SecretRotation.RedisCredentials]: RedisCredentialsRotationReviewFields,
  [SecretRotation.MongoDBCredentials]: SqlCredentialsRotationReviewFields,
  [SecretRotation.DatabricksServicePrincipalSecret]:
    DatabricksServicePrincipalSecretRotationReviewFields,
  [SecretRotation.UnixLinuxLocalAccount]: UnixLinuxLocalAccountRotationReviewFields,
  [SecretRotation.DbtServiceToken]: DbtServiceTokenRotationReviewFields,
  [SecretRotation.WindowsLocalAccount]: WindowsLocalAccountRotationReviewFields,
  [SecretRotation.OpenRouterApiKey]: OpenRouterApiKeyRotationReviewFields,
  [SecretRotation.LiteLLMApiKey]: LiteLLMApiKeyRotationReviewFields,
  [SecretRotation.OpenAIServiceAccount]: OpenAIServiceAccountRotationReviewFields,
  [SecretRotation.HpIloLocalAccount]: HpIloRotationReviewFields,
  [SecretRotation.SupabaseApiKey]: SupabaseApiKeyRotationReviewFields,
  [SecretRotation.SalesforceOauthCredentials]: SalesforceOauthCredentialsRotationReviewFields,
  [SecretRotation.DatadogApplicationKeySecret]: DatadogApplicationKeySecretRotationReviewFields,
  [SecretRotation.DatadogApiKey]: DatadogApiKeyRotationReviewFields,
  [SecretRotation.ConvexAccessKey]: ConvexAccessKeyRotationReviewFields,
  [SecretRotation.FireworksApiKey]: FireworksApiKeyRotationReviewFields,
  [SecretRotation.SnowflakeUserKeyPair]: SnowflakeUserKeyPairRotationReviewFields,
  [SecretRotation.CloudflareApiToken]: CloudflareApiTokenRotationReviewFields,
  [SecretRotation.CloudflareR2AccessKey]: CloudflareR2AccessKeyRotationReviewFields
};

export const SecretRotationV2ReviewFields = () => {
  const { watch } = useFormContext<TSecretRotationV2Form>();

  const {
    environment,
    secretPath,
    connection,
    type,
    name,
    description,
    rotationInterval,
    rotateAtUtc
  } = watch();

  const Component = COMPONENT_MAP[type];

  return (
    <div className="mb-4 flex flex-col gap-6">
      <DetailGroup>
        <DetailGroupHeader className="border-b border-border pb-1">Configuration</DetailGroupHeader>
        <div className="flex flex-wrap gap-x-8 gap-y-2">
          <ReviewField label="Connection">{connection.name}</ReviewField>
          <ReviewField label="Environment">{environment.name}</ReviewField>
          <ReviewField label="Secret Path">{secretPath}</ReviewField>
          <ReviewField label="Rotation Interval">
            {rotationInterval} Day{rotationInterval > 1 ? "s" : ""}
          </ReviewField>
          <ReviewField label="Rotate At">
            {format(getRotateAtLocal(rotateAtUtc), "h:mm aa")}
          </ReviewField>
        </div>
      </DetailGroup>
      <Component />
      <DetailGroup>
        <DetailGroupHeader className="border-b border-border pb-1">Details</DetailGroupHeader>
        <div className="flex flex-wrap gap-x-8 gap-y-2">
          <ReviewField label="Name">{name}</ReviewField>
          <ReviewField label="Description">{description}</ReviewField>
        </div>
      </DetailGroup>
    </div>
  );
};
