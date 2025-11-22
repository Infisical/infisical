import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import {
  TSecretRotationV2Base,
  TSecretRotationV2GeneratedCredentialsResponseBase,
  TSqlCredentialsRotationGeneratedCredentials,
  TSqlCredentialsRotationProperties
} from "@app/hooks/api/secretRotationsV2/types/shared";

export type TMongoDBCredentialsRotation = TSecretRotationV2Base & {
  type: SecretRotation.MongoDBCredentials;
} & TSqlCredentialsRotationProperties;

export type TMongoDBCredentialsRotationGeneratedCredentialsResponse =
  TSecretRotationV2GeneratedCredentialsResponseBase<
    SecretRotation.MongoDBCredentials,
    TSqlCredentialsRotationGeneratedCredentials
  >;

export type TMongoDBCredentialsRotationOption = {
  name: string;
  type: SecretRotation.MongoDBCredentials;
  connection: AppConnection.MongoDB;
  template: {
    createUserStatement: string;
    secretsMapping: TMongoDBCredentialsRotation["secretsMapping"];
  };
};
