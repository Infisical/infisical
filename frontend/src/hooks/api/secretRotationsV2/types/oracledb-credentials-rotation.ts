import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import {
  TSecretRotationV2Base,
  TSecretRotationV2GeneratedCredentialsResponseBase,
  TSqlCredentialsRotationGeneratedCredentials,
  TSqlCredentialsRotationProperties
} from "@app/hooks/api/secretRotationsV2/types/shared";

export type TOracleDBCredentialsRotation = TSecretRotationV2Base & {
  type: SecretRotation.OracleDBCredentials;
} & TSqlCredentialsRotationProperties;

export type TOracleDBCredentialsRotationGeneratedCredentialsResponse =
  TSecretRotationV2GeneratedCredentialsResponseBase<
    SecretRotation.OracleDBCredentials,
    TSqlCredentialsRotationGeneratedCredentials
  >;
