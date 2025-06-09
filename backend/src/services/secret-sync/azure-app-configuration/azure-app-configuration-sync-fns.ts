/* eslint-disable no-await-in-loop */
import https from "https";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { getAzureConnectionAccessToken } from "@app/services/app-connection/azure-key-vault";
import { isAzureKeyVaultReference } from "@app/services/integration-auth/integration-sync-secret-fns";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import { TAzureAppConfigurationSyncWithCredentials } from "./azure-app-configuration-sync-types";

type TAzureAppConfigurationSyncFactoryDeps = {
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById" | "update">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

interface AzureAppConfigKeyValue {
  key: string;
  value: string;
  label?: string;
}

export const azureAppConfigurationSyncFactory = ({
  kmsService,
  appConnectionDAL
}: TAzureAppConfigurationSyncFactoryDeps) => {
  const $getCompleteAzureAppConfigValues = async (accessToken: string, baseURL: string, url: string) => {
    let result: AzureAppConfigKeyValue[] = [];
    let currentUrl = url;

    while (currentUrl) {
      const res = await request.get<{ items: AzureAppConfigKeyValue[]; ["@nextLink"]: string }>(currentUrl, {
        baseURL,
        headers: {
          Authorization: `Bearer ${accessToken}`
        },
        // we force IPV4 because docker setup fails with ipv6
        httpsAgent: new https.Agent({
          family: 4
        })
      });

      result = result.concat(res.data.items);
      currentUrl = res.data?.["@nextLink"];
    }

    return result;
  };

  const $deleteAzureSecret = async (accessToken: string, configurationUrl: string, key: string, label?: string) => {
    await request.delete(`${configurationUrl}/kv/${key}?api-version=2023-11-01`, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      ...(label &&
        label.length > 0 && {
          params: {
            label
          }
        }),
      httpsAgent: new https.Agent({
        family: 4
      })
    });
  };

  const syncSecrets = async (secretSync: TAzureAppConfigurationSyncWithCredentials, secretMap: TSecretMap) => {
    if (!secretSync.destinationConfig.configurationUrl.endsWith(".azconfig.io")) {
      throw new BadRequestError({
        message: "Invalid Azure App Configuration URL provided."
      });
    }

    const { accessToken } = await getAzureConnectionAccessToken(secretSync.connectionId, appConnectionDAL, kmsService);

    const azureAppConfigValuesUrl = `/kv?api-version=2023-11-01${
      secretSync.destinationConfig.label ? `&label=${secretSync.destinationConfig.label}` : "&label=%00"
    }`;

    const azureAppConfigValuesUrlAllSecrets = `/kv?api-version=2023-11-01`;

    const azureAppConfigSecretsLabeled = Object.fromEntries(
      (
        await $getCompleteAzureAppConfigValues(
          accessToken,
          secretSync.destinationConfig.configurationUrl,
          azureAppConfigValuesUrl
        )
      ).map((entry) => [entry.key, entry.value])
    );

    const azureAppConfigSecrets = Object.fromEntries(
      (
        await $getCompleteAzureAppConfigValues(
          accessToken,
          secretSync.destinationConfig.configurationUrl,
          azureAppConfigValuesUrlAllSecrets
        )
      ).map((entry) => [
        entry.key,
        {
          value: entry.value,
          label: entry.label
        }
      ])
    );

    // add the secrets to azure app config, that are in infisical
    for await (const key of Object.keys(secretMap)) {
      if (!(key in azureAppConfigSecretsLabeled) || secretMap[key]?.value !== azureAppConfigSecretsLabeled[key]) {
        await request.put(
          `${secretSync.destinationConfig.configurationUrl}/kv/${key}?api-version=2023-11-01`,
          {
            value: secretMap[key]?.value,
            ...(isAzureKeyVaultReference(secretMap[key]?.value || "") && {
              content_type: "application/vnd.microsoft.appconfig.keyvaultref+json;charset=utf-8"
            })
          },
          {
            ...(secretSync.destinationConfig.label && {
              params: {
                label: secretSync.destinationConfig.label
              }
            }),

            headers: {
              Authorization: `Bearer ${accessToken}`
            },
            httpsAgent: new https.Agent({
              family: 4
            })
          }
        );
      }
    }

    if (secretSync.syncOptions.disableSecretDeletion) return;

    for await (const key of Object.keys(azureAppConfigSecrets)) {
      // eslint-disable-next-line no-continue
      if (!matchesSchema(key, secretSync.environment?.slug || "", secretSync.syncOptions.keySchema)) continue;

      const azureSecret = azureAppConfigSecrets[key];
      if (
        !(key in secretMap) ||
        secretMap[key] === null ||
        (azureSecret.label && azureSecret.label !== secretSync.destinationConfig.label) ||
        (!azureSecret.label && secretSync.destinationConfig.label)
      ) {
        await $deleteAzureSecret(accessToken, secretSync.destinationConfig.configurationUrl, key, azureSecret.label);
      }
    }
  };

  const removeSecrets = async (secretSync: TAzureAppConfigurationSyncWithCredentials, secretMap: TSecretMap) => {
    const { accessToken } = await getAzureConnectionAccessToken(secretSync.connectionId, appConnectionDAL, kmsService);

    const azureAppConfigValuesUrl = `/kv?api-version=2023-11-01${
      secretSync.destinationConfig.label ? `&label=${secretSync.destinationConfig.label}` : "&label=%00"
    }`;

    const azureAppConfigSecrets = Object.fromEntries(
      (
        await $getCompleteAzureAppConfigValues(
          accessToken,
          secretSync.destinationConfig.configurationUrl,
          azureAppConfigValuesUrl
        )
      ).map((entry) => [entry.key, entry.value])
    );

    for await (const infisicalKey of Object.keys(secretMap)) {
      if (infisicalKey in azureAppConfigSecrets) {
        await $deleteAzureSecret(
          accessToken,
          secretSync.destinationConfig.configurationUrl,
          infisicalKey,
          secretSync.destinationConfig.label
        );
      }
    }
  };

  const getSecrets = async (secretSync: TAzureAppConfigurationSyncWithCredentials) => {
    const { accessToken } = await getAzureConnectionAccessToken(secretSync.connectionId, appConnectionDAL, kmsService);

    const secretMap: TSecretMap = {};

    const azureAppConfigValuesUrl = `/kv?api-version=2023-11-01${
      secretSync.destinationConfig.label ? `&label=${secretSync.destinationConfig.label}` : "&label=%00"
    }`;

    const azureAppConfigSecrets = Object.fromEntries(
      (
        await $getCompleteAzureAppConfigValues(
          accessToken,
          secretSync.destinationConfig.configurationUrl,
          azureAppConfigValuesUrl
        )
      ).map((entry) => [entry.key, entry.value])
    );

    Object.keys(azureAppConfigSecrets).forEach((key) => {
      secretMap[key] = {
        value: azureAppConfigSecrets[key]
      };
    });

    return secretMap;
  };

  return {
    syncSecrets,
    removeSecrets,
    getSecrets
  };
};
