import { TPasswordRequirements } from "@app/components/secret-rotations-v2/forms/schemas/shared";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import {
  TSecretRotationV2Base,
  TSecretRotationV2GeneratedCredentialsResponseBase
} from "@app/hooks/api/secretRotationsV2/types/shared";

export enum UnixLinuxLocalAccountRotationMethod {
  LoginAsTarget = "login-as-target",
  LoginAsRoot = "login-as-root"
}

export type TUnixLinuxLocalAccountRotation = TSecretRotationV2Base & {
  type: SecretRotation.UnixLinuxLocalAccount;
  parameters: {
    username: string;
    rotationMethod?: UnixLinuxLocalAccountRotationMethod;
    passwordRequirements?: TPasswordRequirements;
  };
  secretsMapping: {
    username: string;
    password: string;
  };
};

export type TUnixLinuxLocalAccountRotationGeneratedCredentials = {
  username: string;
  password: string;
};

export type TUnixLinuxLocalAccountRotationGeneratedCredentialsResponse =
  TSecretRotationV2GeneratedCredentialsResponseBase<
    SecretRotation.UnixLinuxLocalAccount,
    TUnixLinuxLocalAccountRotationGeneratedCredentials
  >;

export type TUnixLinuxLocalAccountRotationOption = {
  name: string;
  type: SecretRotation.UnixLinuxLocalAccount;
  connection: AppConnection.SSH;
  template: {
    secretsMapping: TUnixLinuxLocalAccountRotation["secretsMapping"];
  };
};
