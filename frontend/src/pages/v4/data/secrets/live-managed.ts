import { useListAvailableAppConnections } from "@app/hooks/api/appConnections/queries";
import { useListAwsHoneyTokenDeploymentOptions } from "@app/hooks/api/honeyToken/queries";
import {
  useCreateHoneyToken,
  useResetHoneyToken,
  useRevokeHoneyToken,
  useUpdateHoneyToken
} from "@app/hooks/api/honeyTokens/mutations";
import { useGetHoneyTokenCredentials } from "@app/hooks/api/honeyTokens/queries";
import {
  useDeleteProxiedService,
  useUpdateProxiedService
} from "@app/hooks/api/proxiedServices/mutations";
import {
  useCheckSecretRotationV2Credentials,
  useCreateSecretRotationV2,
  useDeleteSecretRotationV2,
  useReconcileLocalAccountRotation,
  useRotateSecretRotationV2,
  useUpdateSecretRotationV2
} from "@app/hooks/api/secretRotationsV2/mutations";
import { useViewSecretRotationV2GeneratedCredentials } from "@app/hooks/api/secretRotationsV2/queries";
import {
  useCreateSecretSync,
  useDeleteSecretSync,
  useTriggerSecretSyncImportSecrets,
  useTriggerSecretSyncRemoveSecrets,
  useTriggerSecretSyncSyncSecrets,
  useUpdateSecretSync
} from "@app/hooks/api/secretSyncs/mutations";
import {
  useCheckDuplicateDestination,
  useCheckRecursiveConflicts,
  useGetSecretSync,
  useListSecretSyncs,
  useSecretSyncOptions
} from "@app/hooks/api/secretSyncs/queries";

import type { SecretsManagedAdapter } from "./contract-managed";
import { secretsOptionsLive } from "./live-options";
import { syncAutomationLive } from "./live-sync-automation";
import { syncCloudLive } from "./live-sync-cloud";
import { syncDataLive } from "./live-sync-data";
import { syncDeployLive } from "./live-sync-deploy";
import { syncGitLive } from "./live-sync-git";
import { syncHostingLive } from "./live-sync-hosting";
import { syncVaultsLive } from "./live-sync-vaults";

export const secretsManagedLive: SecretsManagedAdapter = {
  ...secretsOptionsLive,
  ...syncCloudLive,
  ...syncDataLive,
  ...syncVaultsLive,
  ...syncGitLive,
  ...syncDeployLive,
  ...syncHostingLive,
  ...syncAutomationLive,
  useSecretRotationCredentials: (dto, options) =>
    useViewSecretRotationV2GeneratedCredentials(dto, { enabled: options?.enabled }),
  useCreateSecretRotation: useCreateSecretRotationV2,
  useUpdateSecretRotation: useUpdateSecretRotationV2,
  useRotateSecretRotation: useRotateSecretRotationV2,
  useDeleteSecretRotation: useDeleteSecretRotationV2,
  useReconcileSecretRotation: useReconcileLocalAccountRotation,
  useCheckSecretRotationCredentials: useCheckSecretRotationV2Credentials,
  useHoneyTokenCredentials: useGetHoneyTokenCredentials,
  useHoneyTokenDeploymentOptions: useListAwsHoneyTokenDeploymentOptions,
  useCreateHoneyToken,
  useUpdateHoneyToken,
  useResetHoneyToken,
  useRevokeHoneyToken,
  useUpdateProxiedService,
  useDeleteProxiedService,
  useSecretSyncs: (projectId, options) =>
    useListSecretSyncs(projectId, { refetchInterval: options?.refetchInterval }),
  useSecretSync: (destination, syncId) =>
    useGetSecretSync(destination, syncId, { refetchInterval: 30_000 }),
  useSecretSyncOptions: () => useSecretSyncOptions(),
  useSecretSyncRecursiveConflicts: (dto, options) =>
    useCheckRecursiveConflicts(
      dto.destination,
      dto.projectId,
      dto.environment,
      dto.secretPath,
      dto.keySchema,
      { enabled: options?.enabled, staleTime: 0, gcTime: 0 }
    ),
  useSecretSyncDuplicate: (dto, options) =>
    useCheckDuplicateDestination(
      dto.destination,
      dto.destinationConfig,
      dto.projectId,
      dto.excludeSyncId,
      dto.connectionId,
      {
        enabled:
          (options?.enabled ?? true) &&
          Object.keys((dto.destinationConfig as object | null) ?? {}).length > 0
      }
    ),
  useCreateSecretSync,
  useUpdateSecretSync,
  useDeleteSecretSync,
  useTriggerSecretSync: useTriggerSecretSyncSyncSecrets,
  useImportSecretSyncSecrets: useTriggerSecretSyncImportSecrets,
  useRemoveSecretSyncSecrets: useTriggerSecretSyncRemoveSecrets,
  useSyncConnections: (app, projectId, options) =>
    useListAvailableAppConnections(app, projectId, { enabled: options?.enabled })
};
