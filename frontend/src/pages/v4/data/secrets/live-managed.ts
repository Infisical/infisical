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
import { useCreateSecretSync } from "@app/hooks/api/secretSyncs/mutations";
import { useListSecretSyncs } from "@app/hooks/api/secretSyncs/queries";

import type { SecretsManagedAdapter } from "./contract-managed";

export const secretsManagedLive: SecretsManagedAdapter = {
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
  useSecretSyncs: (projectId) => useListSecretSyncs(projectId),
  useCreateSecretSync,
  useSyncConnections: (app, projectId, options) =>
    useListAvailableAppConnections(app, projectId, { enabled: options?.enabled })
};
