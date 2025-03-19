import {
  TPostgresCredentialsRotation,
  TPostgresCredentialsRotationInput,
  TPostgresCredentialsRotationListItem,
  TPostgresCredentialsRotationWithConnection
} from "./postgres-credentials";
import { SecretRotation } from "./secret-rotation-v2-enums";

export type TSecretRotationV2 = TPostgresCredentialsRotation;

export type TSecretRotationV2WithConnection = TPostgresCredentialsRotationWithConnection;

export type TSecretRotationV2Input = TPostgresCredentialsRotationInput;

export type TSecretRotationV2ListItem = TPostgresCredentialsRotationListItem;

export type TListSecretRotationsV2ByProjectId = {
  projectId: string;
  type?: SecretRotation;
};

export type TFindSecretRotationV2ByIdDTO = {
  rotationId: string;
  type: SecretRotation;
};

export type TFindSecretRotationV2ByNameDTO = {
  rotationName: string;
  projectId: string;
  type: SecretRotation;
};

export type TCreateSecretRotationV2DTO = Pick<
  TSecretRotationV2,
  "parameters" | "description" | "interval" | "name" | "connectionId" | "projectId"
> & {
  type: SecretRotation;
  secretPath: string;
  environment: string;
  isAutoRotationEnabled?: boolean;
};

export type TUpdateSecretRotationV2DTO = Partial<Omit<TCreateSecretRotationV2DTO, "projectId" | "connectionId">> & {
  rotationId: string;
  type: SecretRotation;
};

export type TDeleteSecretRotationV2DTO = {
  type: SecretRotation;
  rotationId: string;
  removeSecrets: boolean;
};
