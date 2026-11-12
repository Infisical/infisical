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
import type { SecretSync } from "@app/hooks/api/secretSyncs/enums";
import type {
  TCreateSecretSyncDTO,
  TDeleteSecretSyncDTO,
  TSecretSync,
  TSecretSyncOption,
  TTriggerSecretSyncImportSecretsDTO,
  TTriggerSecretSyncRemoveSecretsDTO,
  TTriggerSecretSyncSyncSecretsDTO,
  TUpdateSecretSyncDTO
} from "@app/hooks/api/secretSyncs/types";

import type { V4Mutation, V4QueryResult } from "../contract";
import type { SecretsOptionsAdapter } from "./contract-options";
import type { SyncAutomationLookups } from "./contract-sync-automation";
import type { SyncCloudLookups } from "./contract-sync-cloud";
import type { SyncDataLookups } from "./contract-sync-data";
import type { SyncDeployLookups } from "./contract-sync-deploy";
import type { SyncGitLookups } from "./contract-sync-git";
import type { SyncHostingLookups } from "./contract-sync-hosting";
import type { SyncVaultsLookups } from "./contract-sync-vaults";

export type SecretsManagedAdapter = SecretsOptionsAdapter &
  SyncCloudLookups &
  SyncDataLookups &
  SyncVaultsLookups &
  SyncGitLookups &
  SyncDeployLookups &
  SyncHostingLookups &
  SyncAutomationLookups & {
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
    useSecretSyncs: (
      projectId: string,
      options?: { refetchInterval?: number }
    ) => V4QueryResult<TSecretSync[]>;
    useSecretSync: (destination: SecretSync, syncId: string) => V4QueryResult<TSecretSync>;
    useSecretSyncOptions: () => V4QueryResult<TSecretSyncOption[]>;
    useSecretSyncDuplicate: (
      dto: {
        destination: SecretSync;
        destinationConfig: unknown;
        projectId: string;
        excludeSyncId?: string;
        connectionId?: string;
      },
      options?: { enabled?: boolean }
    ) => V4QueryResult<{ hasDuplicate: boolean; duplicateProjectId?: string }>;
    useCreateSecretSync: V4Mutation<TCreateSecretSyncDTO>;
    useUpdateSecretSync: V4Mutation<TUpdateSecretSyncDTO, TSecretSync>;
    useDeleteSecretSync: V4Mutation<TDeleteSecretSyncDTO>;
    useTriggerSecretSync: V4Mutation<TTriggerSecretSyncSyncSecretsDTO>;
    useImportSecretSyncSecrets: V4Mutation<TTriggerSecretSyncImportSecretsDTO>;
    useRemoveSecretSyncSecrets: V4Mutation<TTriggerSecretSyncRemoveSecretsDTO>;
    useSyncConnections: (
      app: AppConnection,
      projectId: string,
      options?: { enabled?: boolean }
    ) => V4QueryResult<TAvailableAppConnection[]>;
  };
