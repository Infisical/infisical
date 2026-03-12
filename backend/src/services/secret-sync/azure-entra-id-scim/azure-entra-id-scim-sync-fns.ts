import { request } from "@app/lib/config/request";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

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

    const secretEntry = Object.entries(secretMap).find(([, s]) => s.id === secretId);
    if (!secretEntry) {
      throw new SecretSyncError({
        error: new Error(`Secret with ID "${secretId}" not found in source`)
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
