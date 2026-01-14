import { TPasswordRequirements } from "@app/components/secret-rotations-v2/forms/schemas/shared";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import {
  TSecretRotationV2Base,
  TSecretRotationV2GeneratedCredentialsResponseBase
} from "@app/hooks/api/secretRotationsV2/types/shared";

export enum SshPasswordRotationMethod {
  LoginAsTarget = "login-as-target",
  LoginAsRoot = "login-as-root"
}

export type TSshPasswordRotation = TSecretRotationV2Base & {
  type: SecretRotation.SshPassword;
  parameters: {
    username: string;
    rotationMethod?: SshPasswordRotationMethod;
    passwordRequirements?: TPasswordRequirements;
  };
  secretsMapping: {
    username: string;
    password: string;
  };
};

export type TSshPasswordRotationGeneratedCredentials = {
  username: string;
  password: string;
};

export type TSshPasswordRotationGeneratedCredentialsResponse =
  TSecretRotationV2GeneratedCredentialsResponseBase<
    SecretRotation.SshPassword,
    TSshPasswordRotationGeneratedCredentials
  >;

export type TSshPasswordRotationOption = {
  name: string;
  type: SecretRotation.SshPassword;
  connection: AppConnection.SSH;
  template: {
    secretsMapping: TSshPasswordRotation["secretsMapping"];
  };
};
