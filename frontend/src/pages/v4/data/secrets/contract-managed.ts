import type { AppConnection } from "@app/hooks/api/appConnections/enums";
import type { TAvailableAppConnection } from "@app/hooks/api/appConnections/types";
import type { TAwsHoneyTokenDeploymentOption } from "@app/hooks/api/honeyToken/types";
import type {
  TCreateHoneyTokenDTO,
  TCreateHoneyTokenResponse,
  TRevokeHoneyTokenDTO,
  TUpdateHoneyTokenDTO
} from "@app/hooks/api/honeyTokens/types";
import type {
  TDeleteProxiedServiceDTO,
  TUpdateProxiedServiceDTO
} from "@app/hooks/api/proxiedServices/types";
import type { SecretRotation } from "@app/hooks/api/secretRotationsV2/enums";
import type {
  TCheckSecretRotationV2CredentialsDTO,
  TCreateSecretRotationV2DTO,
  TDeleteSecretRotationV2DTO,
  TReconcileLocalAccountRotationDTO,
  TReconcileLocalAccountRotationResponse,
  TRotateSecretRotationV2DTO,
  TUpdateSecretRotationV2DTO,
  TViewSecretRotationGeneratedCredentialsResponse
} from "@app/hooks/api/secretRotationsV2/types";
import type { TCreateSecretSyncDTO, TSecretSync } from "@app/hooks/api/secretSyncs/types";

import type { V4Mutation, V4QueryResult } from "../contract";

export type SecretsManagedAdapter = {
  useSecretRotationCredentials: (
    dto: { rotationId: string; type: SecretRotation },
    options?: { enabled?: boolean }
  ) => V4QueryResult<TViewSecretRotationGeneratedCredentialsResponse>;
  useCreateSecretRotation: V4Mutation<TCreateSecretRotationV2DTO>;
  useUpdateSecretRotation: V4Mutation<TUpdateSecretRotationV2DTO>;
  useRotateSecretRotation: V4Mutation<TRotateSecretRotationV2DTO>;
  useDeleteSecretRotation: V4Mutation<TDeleteSecretRotationV2DTO>;
  useReconcileSecretRotation: V4Mutation<
    TReconcileLocalAccountRotationDTO,
    TReconcileLocalAccountRotationResponse
  >;
  useCheckSecretRotationCredentials: V4Mutation<TCheckSecretRotationV2CredentialsDTO>;
  useHoneyTokenCredentials: (dto: {
    honeyTokenId: string;
    projectId: string;
    enabled?: boolean;
  }) => V4QueryResult<Record<string, string>>;
  useHoneyTokenDeploymentOptions: (options?: {
    refetchOnWindowFocus?: "always";
  }) => V4QueryResult<TAwsHoneyTokenDeploymentOption[]> & { refetch: () => unknown };
  useCreateHoneyToken: V4Mutation<TCreateHoneyTokenDTO, TCreateHoneyTokenResponse>;
  useUpdateHoneyToken: V4Mutation<TUpdateHoneyTokenDTO>;
  useResetHoneyToken: V4Mutation<TRevokeHoneyTokenDTO>;
  useRevokeHoneyToken: V4Mutation<TRevokeHoneyTokenDTO>;
  useUpdateProxiedService: V4Mutation<TUpdateProxiedServiceDTO>;
  useDeleteProxiedService: V4Mutation<TDeleteProxiedServiceDTO>;
  useSecretSyncs: (projectId: string) => V4QueryResult<TSecretSync[]>;
  useCreateSecretSync: V4Mutation<TCreateSecretSyncDTO>;
  useSyncConnections: (
    app: AppConnection,
    projectId: string,
    options?: { enabled?: boolean }
  ) => V4QueryResult<TAvailableAppConnection[]>;
};
