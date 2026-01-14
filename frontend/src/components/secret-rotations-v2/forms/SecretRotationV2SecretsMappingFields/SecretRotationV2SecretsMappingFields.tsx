import { useFormContext } from "react-hook-form";

import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

import { TSecretRotationV2Form } from "../schemas";
import { Auth0ClientSecretRotationSecretsMappingFields } from "./Auth0ClientSecretRotationSecretsMappingFields";
import { AwsIamUserSecretRotationSecretsMappingFields } from "./AwsIamUserSecretRotationSecretsMappingFields";
import { AzureClientSecretRotationSecretsMappingFields } from "./AzureClientSecretRotationSecretsMappingFields";
import { DatabricksServicePrincipalSecretRotationSecretsMappingFields } from "./DatabricksServicePrincipalSecretRotationSecretsMappingFields";
import { LdapPasswordRotationSecretsMappingFields } from "./LdapPasswordRotationSecretsMappingFields";
import { OktaClientSecretRotationSecretsMappingFields } from "./OktaClientSecretRotationSecretsMappingFields";
import { RedisCredentialsRotationSecretsMappingFields } from "./RedisCredentialsRotationSecretsMappingFields";
import { SqlCredentialsRotationSecretsMappingFields } from "./shared";
import { SshPasswordRotationSecretsMappingFields } from "./SshPasswordRotationSecretsMappingFields";

const COMPONENT_MAP: Record<SecretRotation, React.FC> = {
  [SecretRotation.PostgresCredentials]: SqlCredentialsRotationSecretsMappingFields,
  [SecretRotation.MsSqlCredentials]: SqlCredentialsRotationSecretsMappingFields,
  [SecretRotation.MySqlCredentials]: SqlCredentialsRotationSecretsMappingFields,
  [SecretRotation.OracleDBCredentials]: SqlCredentialsRotationSecretsMappingFields,
  [SecretRotation.Auth0ClientSecret]: Auth0ClientSecretRotationSecretsMappingFields,
  [SecretRotation.AzureClientSecret]: AzureClientSecretRotationSecretsMappingFields,
  [SecretRotation.LdapPassword]: LdapPasswordRotationSecretsMappingFields,
  [SecretRotation.AwsIamUserSecret]: AwsIamUserSecretRotationSecretsMappingFields,
  [SecretRotation.OktaClientSecret]: OktaClientSecretRotationSecretsMappingFields,
  [SecretRotation.RedisCredentials]: RedisCredentialsRotationSecretsMappingFields,
  [SecretRotation.MongoDBCredentials]: SqlCredentialsRotationSecretsMappingFields,
  [SecretRotation.DatabricksServicePrincipalSecret]:
    DatabricksServicePrincipalSecretRotationSecretsMappingFields,
  [SecretRotation.SshPassword]: SshPasswordRotationSecretsMappingFields
};

export const SecretRotationV2SecretsMappingFields = () => {
  const { watch } = useFormContext<TSecretRotationV2Form>();

  const rotationType = watch("type");

  const Component = COMPONENT_MAP[rotationType];

  return (
    <>
      <p className="mb-4 text-sm text-bunker-300">
        Map the rotated credentials to secrets in your Infisical project.
      </p>
      <Component />
    </>
  );
};
