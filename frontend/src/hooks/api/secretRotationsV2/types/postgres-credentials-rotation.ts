import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import {
  TSecretRotationV2Base,
  TSecretRotationV2GeneratedCredentialsResponseBase,
  TSqlCredentialsRotationGeneratedCredentials,
  TSqlCredentialsRotationProperties
} from "@app/hooks/api/secretRotationsV2/types/shared";

export type TPostgresCredentialsRotation = TSecretRotationV2Base & {
  type: SecretRotation.PostgresCredentials;
} & TSqlCredentialsRotationProperties;

export type TPostgresCredentialsRotationGeneratedCredentialsResponse =
  TSecretRotationV2GeneratedCredentialsResponseBase<
    SecretRotation.PostgresCredentials,
    TSqlCredentialsRotationGeneratedCredentials
  >;
