import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import {
  TMsSqlCredentialsRotation,
  TMsSqlCredentialsRotationGeneratedCredentialsResponse
} from "@app/hooks/api/secretRotationsV2/types/mssql-credentials-rotation";
import {
  TPostgresCredentialsRotation,
  TPostgresCredentialsRotationGeneratedCredentialsResponse
} from "@app/hooks/api/secretRotationsV2/types/postgres-credentials-rotation";
import { TSqlOptionTemplate } from "@app/hooks/api/secretRotationsV2/types/shared";
import { SecretV3RawSanitized } from "@app/hooks/api/secrets/types";
import { DiscriminativePick } from "@app/types";

export type TSecretRotationV2 = (TPostgresCredentialsRotation | TMsSqlCredentialsRotation) & {
  secrets: (SecretV3RawSanitized | null)[];
};

export type TSecretRotationV2Option = {
  name: string;
  type: SecretRotation;
  connection: AppConnection;
  template: TSqlOptionTemplate;
};

export type TListSecretRotationV2Options = { secretRotationOptions: TSecretRotationV2Option[] };

export type TSecretRotationV2Response = { secretRotation: TSecretRotationV2 };

export type TViewSecretRotationGeneratedCredentialsResponse =
  | TPostgresCredentialsRotationGeneratedCredentialsResponse
  | TMsSqlCredentialsRotationGeneratedCredentialsResponse;

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
