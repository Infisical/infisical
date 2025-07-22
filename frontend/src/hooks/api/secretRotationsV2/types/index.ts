import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import {
  TAuth0ClientSecretRotation,
  TAuth0ClientSecretRotationGeneratedCredentialsResponse,
  TAuth0ClientSecretRotationOption
} from "@app/hooks/api/secretRotationsV2/types/auth0-client-secret-rotation";
import {
  TAwsIamUserSecretRotation,
  TAwsIamUserSecretRotationGeneratedCredentialsResponse,
  TAwsIamUserSecretRotationOption
} from "@app/hooks/api/secretRotationsV2/types/aws-iam-user-secret-rotation";
import {
  TAzureClientSecretRotation,
  TAzureClientSecretRotationGeneratedCredentialsResponse,
  TAzureClientSecretRotationOption
} from "@app/hooks/api/secretRotationsV2/types/azure-client-secret-rotation";
import {
  TLdapPasswordRotation,
  TLdapPasswordRotationGeneratedCredentialsResponse,
  TLdapPasswordRotationOption
} from "@app/hooks/api/secretRotationsV2/types/ldap-password-rotation";
import {
  TMsSqlCredentialsRotation,
  TMsSqlCredentialsRotationGeneratedCredentialsResponse
} from "@app/hooks/api/secretRotationsV2/types/mssql-credentials-rotation";
import {
  TPostgresCredentialsRotation,
  TPostgresCredentialsRotationGeneratedCredentialsResponse
} from "@app/hooks/api/secretRotationsV2/types/postgres-credentials-rotation";
import { TSqlCredentialsRotationOption } from "@app/hooks/api/secretRotationsV2/types/shared";
import { SecretV3RawSanitized } from "@app/hooks/api/secrets/types";
import { DiscriminativePick } from "@app/types";

import {
  TMySqlCredentialsRotation,
  TMySqlCredentialsRotationGeneratedCredentialsResponse
} from "./mysql-credentials-rotation";
import {
  TOktaClientSecretRotation,
  TOktaClientSecretRotationGeneratedCredentialsResponse,
  TOktaClientSecretRotationOption
} from "./okta-client-secret-rotation";
import {
  TOracleDBCredentialsRotation,
  TOracleDBCredentialsRotationGeneratedCredentialsResponse
} from "./oracledb-credentials-rotation";

export type TSecretRotationV2 = (
  | TPostgresCredentialsRotation
  | TMsSqlCredentialsRotation
  | TMySqlCredentialsRotation
  | TOracleDBCredentialsRotation
  | TAuth0ClientSecretRotation
  | TAzureClientSecretRotation
  | TLdapPasswordRotation
  | TAwsIamUserSecretRotation
  | TOktaClientSecretRotation
) & {
  secrets: (SecretV3RawSanitized | null)[];
};

export type TSecretRotationV2Option =
  | TSqlCredentialsRotationOption
  | TAuth0ClientSecretRotationOption
  | TAzureClientSecretRotationOption
  | TLdapPasswordRotationOption
  | TAwsIamUserSecretRotationOption
  | TOktaClientSecretRotationOption;

export type TListSecretRotationV2Options = { secretRotationOptions: TSecretRotationV2Option[] };

export type TSecretRotationV2Response = { secretRotation: TSecretRotationV2 };

export type TViewSecretRotationGeneratedCredentialsResponse =
  | TPostgresCredentialsRotationGeneratedCredentialsResponse
  | TMsSqlCredentialsRotationGeneratedCredentialsResponse
  | TMySqlCredentialsRotationGeneratedCredentialsResponse
  | TOracleDBCredentialsRotationGeneratedCredentialsResponse
  | TAuth0ClientSecretRotationGeneratedCredentialsResponse
  | TAzureClientSecretRotationGeneratedCredentialsResponse
  | TLdapPasswordRotationGeneratedCredentialsResponse
  | TAwsIamUserSecretRotationGeneratedCredentialsResponse
  | TOktaClientSecretRotationGeneratedCredentialsResponse;

export type TCreateSecretRotationV2DTO = DiscriminativePick<
  TSecretRotationV2,
  | "name"
  | "parameters"
  | "secretsMapping"
  | "description"
  | "connectionId"
  | "type"
  | "isAutoRotationEnabled"
  | "rotationInterval"
  | "rotateAtUtc"
> & { environment: string; secretPath: string; projectId: string };

export type TUpdateSecretRotationV2DTO = Partial<
  Omit<TCreateSecretRotationV2DTO, "type" | "secretPath" | "projectId">
> & {
  type: SecretRotation;
  rotationId: string;
  // required for query invalidation
  projectId: string;
  secretPath: string;
};

export type TRotateSecretRotationV2DTO = {
  rotationId: string;
  type: SecretRotation;
  // required for query invalidation
  secretPath: string;
  projectId: string;
};

export type TDeleteSecretRotationV2DTO = TRotateSecretRotationV2DTO & {
  revokeGeneratedCredentials: boolean;
  deleteSecrets: boolean;
};

export type TViewSecretRotationV2GeneratedCredentialsDTO = {
  rotationId: string;
  type: SecretRotation;
};

export type TSecretRotationOptionMap = {
  [SecretRotation.PostgresCredentials]: TSqlCredentialsRotationOption;
  [SecretRotation.MsSqlCredentials]: TSqlCredentialsRotationOption;
  [SecretRotation.MySqlCredentials]: TSqlCredentialsRotationOption;
  [SecretRotation.OracleDBCredentials]: TSqlCredentialsRotationOption;
  [SecretRotation.Auth0ClientSecret]: TAuth0ClientSecretRotationOption;
  [SecretRotation.AzureClientSecret]: TAzureClientSecretRotationOption;
  [SecretRotation.LdapPassword]: TLdapPasswordRotationOption;
  [SecretRotation.AwsIamUserSecret]: TAwsIamUserSecretRotationOption;
  [SecretRotation.OktaClientSecret]: TOktaClientSecretRotationOption;
};

export type TSecretRotationGeneratedCredentialsResponseMap = {
  [SecretRotation.PostgresCredentials]: TPostgresCredentialsRotationGeneratedCredentialsResponse;
  [SecretRotation.MsSqlCredentials]: TMsSqlCredentialsRotationGeneratedCredentialsResponse;
  [SecretRotation.MySqlCredentials]: TMySqlCredentialsRotationGeneratedCredentialsResponse;
  [SecretRotation.OracleDBCredentials]: TOracleDBCredentialsRotationGeneratedCredentialsResponse;
  [SecretRotation.Auth0ClientSecret]: TAuth0ClientSecretRotationGeneratedCredentialsResponse;
  [SecretRotation.AzureClientSecret]: TAzureClientSecretRotationGeneratedCredentialsResponse;
  [SecretRotation.LdapPassword]: TLdapPasswordRotationGeneratedCredentialsResponse;
  [SecretRotation.AwsIamUserSecret]: TAwsIamUserSecretRotationGeneratedCredentialsResponse;
  [SecretRotation.OktaClientSecret]: TOktaClientSecretRotationGeneratedCredentialsResponse;
};
