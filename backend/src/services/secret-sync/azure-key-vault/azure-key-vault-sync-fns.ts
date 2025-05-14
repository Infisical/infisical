/* eslint-disable no-await-in-loop */
import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { getAzureConnectionAccessToken } from "@app/services/app-connection/azure-key-vault";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import { SecretSyncError } from "../secret-sync-errors";
import { GetAzureKeyVaultSecret, TAzureKeyVaultSyncWithCredentials } from "./azure-key-vault-sync-types";

type TAzureKeyVaultSyncFactoryDeps = {
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById" | "update">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

export const azureKeyVaultSyncFactory = ({ kmsService, appConnectionDAL }: TAzureKeyVaultSyncFactoryDeps) => {
  const $getAzureKeyVaultSecrets = async (accessToken: string, vaultBaseUrl: string) => {
    const paginateAzureKeyVaultSecrets = async () => {
      let result: GetAzureKeyVaultSecret[] = [];

      let currentUrl = `${vaultBaseUrl}/secrets?api-version=7.3`;

      while (currentUrl) {
        const res = await request.get<{ value: GetAzureKeyVaultSecret; nextLink: string }>(currentUrl, {
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        });

        result = result.concat(res.data.value);
        currentUrl = res.data.nextLink;
      }

      return result;
    };

    const getAzureKeyVaultSecrets = await paginateAzureKeyVaultSecrets();

    const enabledAzureKeyVaultSecrets = getAzureKeyVaultSecrets.filter((secret) => secret.attributes.enabled);

    // disabled keys to skip sending updates to
    const disabledAzureKeyVaultSecretKeys = getAzureKeyVaultSecrets
      .filter(({ attributes }) => !attributes.enabled)
      .map((getAzureKeyVaultSecret) => {
        return getAzureKeyVaultSecret.id.substring(getAzureKeyVaultSecret.id.lastIndexOf("/") + 1);
      });

    let lastSlashIndex: number;
    const res = (
      await Promise.all(
        enabledAzureKeyVaultSecrets.map(async (getAzureKeyVaultSecret) => {
          if (!lastSlashIndex) {
            lastSlashIndex = getAzureKeyVaultSecret.id.lastIndexOf("/");
          }

          const azureKeyVaultSecret = await request.get<GetAzureKeyVaultSecret>(
            `${getAzureKeyVaultSecret.id}?api-version=7.3`,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`
              }
            }
          );

          return {
            ...azureKeyVaultSecret.data,
            key: getAzureKeyVaultSecret.id.substring(lastSlashIndex + 1)
          };
        })
      )
    ).reduce(
      (obj, secret) => ({
        ...obj,
        [secret.key]: secret
      }),
      {} as Record<string, GetAzureKeyVaultSecret>
    );

    return {
      vaultSecrets: res,
      disabledAzureKeyVaultSecretKeys
    };
  };

  const syncSecrets = async (secretSync: TAzureKeyVaultSyncWithCredentials, secretMap: TSecretMap) => {
    const { accessToken } = await getAzureConnectionAccessToken(secretSync.connection.id, appConnectionDAL, kmsService);

    const { vaultSecrets, disabledAzureKeyVaultSecretKeys } = await $getAzureKeyVaultSecrets(
      accessToken,
      secretSync.destinationConfig.vaultBaseUrl
    );

    const setSecrets: {
      key: string;
      value: string;
    }[] = [];

    const deleteSecrets: string[] = [];

    Object.keys(secretMap).forEach((infisicalKey) => {
      const hyphenatedKey = infisicalKey.replaceAll("_", "-");
      if (!(hyphenatedKey in vaultSecrets)) {
        // case: secret has been created
        setSecrets.push({
          key: hyphenatedKey,
          value: secretMap[infisicalKey].value
        });
      } else if (secretMap[infisicalKey].value !== vaultSecrets[hyphenatedKey].value) {
        // case: secret has been updated
        setSecrets.push({
          key: hyphenatedKey,
          value: secretMap[infisicalKey].value
        });
      }
    });

    Object.keys(vaultSecrets).forEach((key) => {
      const underscoredKey = key.replaceAll("-", "_");
      if (!(underscoredKey in secretMap)) {
        deleteSecrets.push(key);
      }
    });

    const setSecretAzureKeyVault = async ({ key, value }: { key: string; value: string }) => {
      let isSecretSet = false;
      let syncError: Error | null = null;
      let maxTries = 6;
      if (disabledAzureKeyVaultSecretKeys.includes(key)) return;

      while (!isSecretSet && maxTries > 0) {
        // try to set secret
        try {
          await request.put(
            `${secretSync.destinationConfig.vaultBaseUrl}/secrets/${key}?api-version=7.3`,
            {
              value
            },
            {
              headers: {
                Authorization: `Bearer ${accessToken}`
              }
            }
          );

          isSecretSet = true;
        } catch (err) {
          syncError = err as Error;
          if (err instanceof AxiosError) {
            // eslint-disable-next-line
            if (err.response?.data?.error?.innererror?.code === "ObjectIsDeletedButRecoverable") {
              await request.post(
                `${secretSync.destinationConfig.vaultBaseUrl}/deletedsecrets/${key}/recover?api-version=7.3`,
                {},
                {
                  headers: {
                    Authorization: `Bearer ${accessToken}`
                  }
                }
              );

              await new Promise((resolve) => {
                setTimeout(resolve, 10_000);
              });
            } else {
              await new Promise((resolve) => {
                setTimeout(resolve, 10_000);
              });
              maxTries -= 1;
            }
          }
        }
      }

      if (!isSecretSet) {
        throw new SecretSyncError({
          error: syncError,
          secretKey: key
        });
      }
    };

    for await (const setSecret of setSecrets) {
      const { key, value } = setSecret;
      await setSecretAzureKeyVault({
        key,
        value
      });
    }

    if (secretSync.syncOptions.disableSecretDeletion) return;

    for await (const deleteSecretKey of deleteSecrets.filter(
      (secret) =>
        matchesSchema(secret, secretSync.syncOptions.keySchema) &&
        !setSecrets.find((setSecret) => setSecret.key === secret)
    )) {
      await request.delete(`${secretSync.destinationConfig.vaultBaseUrl}/secrets/${deleteSecretKey}?api-version=7.3`, {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });
    }
  };

  const removeSecrets = async (secretSync: TAzureKeyVaultSyncWithCredentials, secretMap: TSecretMap) => {
    const { accessToken } = await getAzureConnectionAccessToken(secretSync.connection.id, appConnectionDAL, kmsService);

    const { vaultSecrets, disabledAzureKeyVaultSecretKeys } = await $getAzureKeyVaultSecrets(
      accessToken,
      secretSync.destinationConfig.vaultBaseUrl
    );

    for await (const [key] of Object.entries(vaultSecrets)) {
      const underscoredKey = key.replaceAll("-", "_");

      if (underscoredKey in secretMap) {
        if (!disabledAzureKeyVaultSecretKeys.includes(underscoredKey)) {
          await request.delete(`${secretSync.destinationConfig.vaultBaseUrl}/secrets/${key}?api-version=7.3`, {
            headers: {
              Authorization: `Bearer ${accessToken}`
            }
          });
        }
      }
    }
  };

  const getSecrets = async (secretSync: TAzureKeyVaultSyncWithCredentials) => {
    const { accessToken } = await getAzureConnectionAccessToken(secretSync.connection.id, appConnectionDAL, kmsService);

    const { vaultSecrets, disabledAzureKeyVaultSecretKeys } = await $getAzureKeyVaultSecrets(
      accessToken,
      secretSync.destinationConfig.vaultBaseUrl
    );

    const secretMap: TSecretMap = {};

    Object.keys(vaultSecrets).forEach((key) => {
      if (!disabledAzureKeyVaultSecretKeys.includes(key)) {
        const underscoredKey = key.replaceAll("-", "_");
        secretMap[underscoredKey] = {
          value: vaultSecrets[key].value
        };
      }
    });

    return secretMap;
  };

  return {
    syncSecrets,
    removeSecrets,
    getSecrets
  };
};
