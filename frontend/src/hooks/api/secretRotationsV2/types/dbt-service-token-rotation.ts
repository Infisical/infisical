import { z } from "zod";

import { DbtTokenPermissionsSchema } from "@app/components/secret-rotations-v2/forms/schemas/dbt-service-token-rotation-schema";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import {
  TSecretRotationV2Base,
  TSecretRotationV2GeneratedCredentialsResponseBase
} from "@app/hooks/api/secretRotationsV2/types/shared";

export type TDbtTokenPermissionGrant = z.infer<typeof DbtTokenPermissionsSchema>;

export type TDbtServiceTokenRotation = TSecretRotationV2Base & {
  type: SecretRotation.DbtServiceToken;
  parameters: {
    permissionGrants: TDbtTokenPermissionGrant[];
  };
  secretsMapping: {
    serviceToken: string;
  };
};

export type TDbtServiceTokenRotationGeneratedCredentials = {
  serviceToken: string;
  tokenId: number;
  tokenName: string;
};

export type TDbtServiceTokenRotationGeneratedCredentialsResponse =
  TSecretRotationV2GeneratedCredentialsResponseBase<
    SecretRotation.DbtServiceToken,
    TDbtServiceTokenRotationGeneratedCredentials
  >;

export type TDbtServiceTokenRotationOption = {
  name: string;
  type: SecretRotation.DbtServiceToken;
  connection: AppConnection.Dbt;
  template: {
    secretsMapping: TDbtServiceTokenRotation["secretsMapping"];
  };
};
