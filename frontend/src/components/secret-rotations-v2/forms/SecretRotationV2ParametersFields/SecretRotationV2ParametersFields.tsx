import { useFormContext } from "react-hook-form";

import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

import { TSecretRotationV2Form } from "../schemas";
import { Auth0ClientSecretRotationParametersFields } from "./Auth0ClientSecretRotationParametersFields";
import { AwsIamUserSecretRotationParametersFields } from "./AwsIamUserSecretRotationParametersFields";
import { AzureClientSecretRotationParametersFields } from "./AzureClientSecretRotationParametersFields";
import { DatabricksServicePrincipalSecretRotationParametersFields } from "./DatabricksServicePrincipalSecretRotationParametersFields";
import { LdapPasswordRotationParametersFields } from "./LdapPasswordRotationParametersFields";
import { MongoRotationParametersFields } from "./MongoRotationParametersFields";
import { OktaClientSecretRotationParametersFields } from "./OktaClientSecretRotationParametersFields";
import { RedisCredentialsRotationParametersFields } from "./RedisCredentialsRotationParametersFields";
import { SqlCredentialsRotationParametersFields } from "./shared";
import { UnixLinuxLocalAccountRotationParametersFields } from "./UnixLinuxLocalAccountRotationParametersFields";

const COMPONENT_MAP: Record<SecretRotation, React.FC> = {
  [SecretRotation.PostgresCredentials]: SqlCredentialsRotationParametersFields,
  [SecretRotation.MsSqlCredentials]: SqlCredentialsRotationParametersFields,
  [SecretRotation.MySqlCredentials]: SqlCredentialsRotationParametersFields,
  [SecretRotation.OracleDBCredentials]: SqlCredentialsRotationParametersFields,
  [SecretRotation.Auth0ClientSecret]: Auth0ClientSecretRotationParametersFields,
  [SecretRotation.AzureClientSecret]: AzureClientSecretRotationParametersFields,
  [SecretRotation.LdapPassword]: LdapPasswordRotationParametersFields,
  [SecretRotation.AwsIamUserSecret]: AwsIamUserSecretRotationParametersFields,
  [SecretRotation.OktaClientSecret]: OktaClientSecretRotationParametersFields,
  [SecretRotation.RedisCredentials]: RedisCredentialsRotationParametersFields,
  [SecretRotation.MongoDBCredentials]: MongoRotationParametersFields,
  [SecretRotation.DatabricksServicePrincipalSecret]:
    DatabricksServicePrincipalSecretRotationParametersFields,
  [SecretRotation.UnixLinuxLocalAccount]: UnixLinuxLocalAccountRotationParametersFields
};

export const SecretRotationV2ParametersFields = () => {
  const { watch } = useFormContext<TSecretRotationV2Form>();

  const rotationType = watch("type");

  const Component = COMPONENT_MAP[rotationType];

  return (
    <>
      <p className="mb-4 text-sm text-bunker-300">
        Configure the required parameters for this Secret Rotation.
      </p>
      <Component />
    </>
  );
};
