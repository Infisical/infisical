import {
  TPostgresLoginCredentialsRotation,
  TPostgresLoginCredentialsRotationInput,
  TPostgresLoginCredentialsRotationListItem,
  TPostgresLoginCredentialsRotationWithConnection
} from "./postgres-login-credentials";
import { SecretRotation } from "./secret-rotation-v2-enums";

export type TSecretRotationV2 = TPostgresLoginCredentialsRotation;

export type TSecretRotationV2WithConnection = TPostgresLoginCredentialsRotationWithConnection;

export type TSecretRotationV2Input = TPostgresLoginCredentialsRotationInput;

export type TSecretRotationV2ListItem = TPostgresLoginCredentialsRotationListItem;

export type TListSecretRotationsV2ByProjectId = {
  projectId: string;
  type?: SecretRotation;
};

export type TFindSecretRotationV2ByIdDTO = {
  syncId: string;
  destination: SecretRotation;
};

export type TFindSecretRotationV2ByNameDTO = {
  syncName: string;
  projectId: string;
  destination: SecretRotation;
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

export type TUpdateSecretRotationV2DTO = Partial<Omit<TCreateSecretRotationV2DTO, "projectId">> & {
  rotationId: string;
  type: SecretRotation;
};

export type TDeleteSecretRotationV2DTO = {
  type: SecretRotation;
  rotationId: string;
  removeSecrets: boolean;
};
