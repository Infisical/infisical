import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import {
  TAuth0ClientSecretRotation,
  TAuth0ClientSecretRotationGeneratedCredentialsResponse,
  TAuth0ClientSecretRotationOption
} from "@app/hooks/api/secretRotationsV2/types/auth0-client-secret-rotation";
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

export type TSecretRotationV2 = (
  | TPostgresCredentialsRotation
  | TMsSqlCredentialsRotation
  | TAuth0ClientSecretRotation
) & {
  secrets: (SecretV3RawSanitized | null)[];
};

export type TSecretRotationV2Option =
  | TSqlCredentialsRotationOption
  | TAuth0ClientSecretRotationOption;

export type TListSecretRotationV2Options = { secretRotationOptions: TSecretRotationV2Option[] };

export type TSecretRotationV2Response = { secretRotation: TSecretRotationV2 };

export type TViewSecretRotationGeneratedCredentialsResponse =
  | TPostgresCredentialsRotationGeneratedCredentialsResponse
  | TMsSqlCredentialsRotationGeneratedCredentialsResponse
  | TAuth0ClientSecretRotationGeneratedCredentialsResponse;

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
  [SecretRotation.Auth0ClientSecret]: TAuth0ClientSecretRotationOption;
};

export type TSecretRotationGeneratedCredentialsResponseMap = {
  [SecretRotation.PostgresCredentials]: TPostgresCredentialsRotationGeneratedCredentialsResponse;
  [SecretRotation.MsSqlCredentials]: TMsSqlCredentialsRotationGeneratedCredentialsResponse;
  [SecretRotation.Auth0ClientSecret]: TAuth0ClientSecretRotationGeneratedCredentialsResponse;
};
