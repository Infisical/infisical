import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import {
  TPreSaveTransformDestinationConfigFn,
  TPreSaveTransformSyncOptionsFn,
  TSecretMap
} from "@app/services/secret-sync/secret-sync-types";

import { TAppConnectionDALFactory } from "../../app-connection/app-connection-dal";
import { getAzureEntraIdConnectionAccessToken } from "../../app-connection/azure-entra-id/azure-entra-id-connection-fns";
import { TKmsServiceFactory } from "../../kms/kms-service";
import { TAzureEntraIdScimSyncWithCredentials } from "./azure-entra-id-scim-sync-types";

type TAzureEntraIdScimSyncFactoryDeps = {
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById" | "updateById">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

export const AzureEntraIdScimSyncFns = {
  syncSecrets: async (
    secretSync: TAzureEntraIdScimSyncWithCredentials,
    secretMap: TSecretMap,
    { appConnectionDAL, kmsService }: TAzureEntraIdScimSyncFactoryDeps
  ): Promise<void> => {
    const { servicePrincipalId } = secretSync.destinationConfig;
    const { secretId } = secretSync.syncOptions;

    if (!secretId) {
      throw new SecretSyncError({
        error: new Error("No secret is configured for this SCIM token sync. Please reconfigure syncOptions.secretKey."),
        shouldRetry: false
      });
    }

    const secretEntry = Object.entries(secretMap).find(([, s]) => s.id === secretId);
    if (!secretEntry) {
      throw new SecretSyncError({
        error: new Error(`Secret with ID "${secretId}" not found in source`),
        shouldRetry: false
      });
    }
    const [, secret] = secretEntry;

    const accessToken = await getAzureEntraIdConnectionAccessToken(
      secretSync.connection.id,
      appConnectionDAL,
      kmsService
    );

    await request.put(
      `https://graph.microsoft.com/v1.0/servicePrincipals/${servicePrincipalId}/synchronization/secrets`,
      {
        value: [{ key: "SecretToken", value: secret.value }]
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        }
      }
    );
  },

  getSecrets: async (): Promise<TSecretMap> => {
    // Import is not supported for SCIM token sync
    return {};
  },

  removeSecrets: async (): Promise<void> => {
    // No-op: removing SCIM token is not supported
  }
};

// Resolves secret key to secret ID before saving.
// On update, if the source folder changed but no new secretKey was provided, will validate that the existing secret still exists in the new folder.
export const azureEntraIdScimPreSaveTransformSyncOptions: TPreSaveTransformSyncOptionsFn = async (
  { syncOptions, existingSyncOptions, folderId },
  { secretV2BridgeDAL }
) => {
  // If a new secretKey is provided, resolve it to a secretId
  if (syncOptions && "secretKey" in syncOptions) {
    const { secretKey, ...rest } = syncOptions;
    const secret = await secretV2BridgeDAL.findOne({ key: secretKey as string, folderId });
    if (!secret) {
      throw new BadRequestError({
        message: `Secret with key "${secretKey as string}" not found in the specified source folder`
      });
    }
    return { ...existingSyncOptions, ...rest, secretId: secret.id };
  }

  // If no new secretKey provided, preserve the existing secretId and validate it still exists in the (possibly new) folder
  const existingSecretId = existingSyncOptions?.secretId as string | undefined;
  if (existingSecretId) {
    const secret = await secretV2BridgeDAL.findOne({ id: existingSecretId, folderId });
    if (!secret) {
      throw new BadRequestError({
        message:
          "The previously configured secret no longer exists in the source folder. Please re-specify syncOptions.secretKey."
      });
    }
    return { ...existingSyncOptions, ...syncOptions, secretId: existingSecretId };
  }

  return syncOptions;
};

// Fetches service principal display name from Azure Graph API and stores it in destinationConfig
export const azureEntraIdScimPreSaveTransformDestinationConfig: TPreSaveTransformDestinationConfigFn = async (
  { destinationConfig, connectionId },
  { appConnectionDAL, kmsService }
) => {
  if (!destinationConfig) return destinationConfig;

  const { servicePrincipalId } = destinationConfig;
  if (!servicePrincipalId) return destinationConfig;

  try {
    const accessToken = await getAzureEntraIdConnectionAccessToken(connectionId, appConnectionDAL, kmsService);

    const { data } = await request.get<{ displayName?: string }>(
      `https://graph.microsoft.com/v1.0/servicePrincipals/${servicePrincipalId as string}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        },
        params: {
          $select: "displayName"
        }
      }
    );

    return {
      ...destinationConfig,
      ...(data.displayName && { servicePrincipalDisplayName: data.displayName })
    };
  } catch {
    // If we can't fetch the name, proceed without it
    return destinationConfig;
  }
};
