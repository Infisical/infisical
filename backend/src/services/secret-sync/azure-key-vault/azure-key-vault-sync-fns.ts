/* eslint-disable no-await-in-loop */
import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { getAzureConnectionAccessToken } from "@app/services/app-connection/azure-key-vault/azure-key-vault-connection-fns";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import { SecretSyncError } from "../secret-sync-errors";
import { AzureKeyVaultSyncMappingBehavior } from "./azure-key-vault-sync-enums";
import { GetAzureKeyVaultSecret, TAzureKeyVaultSyncWithCredentials } from "./azure-key-vault-sync-types";

type TAzureKeyVaultSyncFactoryDeps = {
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById" | "updateById">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

const AZURE_KEY_VAULT_CERTIFICATE_CONTENT_TYPES = ["application/x-pkcs12", "application/x-pem-file"];

const setSecretAzureKeyVault = async (
  accessToken: string,
  secretSync: TAzureKeyVaultSyncWithCredentials,
  disabledAzureKeyVaultSecretKeys: string[],
  { key, value }: { key: string; value: string }
) => {
  let isSecretSet = false;
  let syncError: Error | null = null;
  let maxTries = 6;
  if (disabledAzureKeyVaultSecretKeys.includes(key)) return;

  while (!isSecretSet && maxTries > 0) {
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

export const azureKeyVaultSyncFactory = ({ kmsService, appConnectionDAL }: TAzureKeyVaultSyncFactoryDeps) => {
  const $getAzureKeyVaultSecrets = async (
    accessToken: string,
    vaultBaseUrl: string,
    { disableCertificateImport = false }: { disableCertificateImport?: boolean } = {}
  ) => {
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

    // certificate-backed secrets have a contentType of application/x-pkcs12 or application/x-pem-file;
    // filter them out at the list stage if the option is enabled (avoids fetching their values too)
    const visibleSecrets = disableCertificateImport
      ? getAzureKeyVaultSecrets.filter(
          (secret) => !AZURE_KEY_VAULT_CERTIFICATE_CONTENT_TYPES.includes(secret.contentType ?? "")
        )
      : getAzureKeyVaultSecrets;

    const enabledAzureKeyVaultSecrets = visibleSecrets.filter((secret) => secret.attributes.enabled);

    // disabled keys to skip sending updates to
    const disabledAzureKeyVaultSecretKeys = visibleSecrets
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

  const syncSecrets = async (
    secretSync: TAzureKeyVaultSyncWithCredentials,
    secretMap: TSecretMap,
    unmodifiedSecretMap: TSecretMap
  ) => {
    const { accessToken } = await getAzureConnectionAccessToken(secretSync.connection.id, appConnectionDAL, kmsService);
    const { destinationConfig } = secretSync;

    if (destinationConfig.mappingBehavior === AzureKeyVaultSyncMappingBehavior.ManyToOne) {
      const secretValue = JSON.stringify(
        Object.fromEntries(Object.entries(unmodifiedSecretMap).map(([key, secretData]) => [key, secretData.value]))
      );

      const { vaultSecrets } = await $getAzureKeyVaultSecrets(accessToken, destinationConfig.vaultBaseUrl, {
        disableCertificateImport: secretSync.syncOptions.disableCertificateImport
      });

      const secretExists = destinationConfig.secretName in vaultSecrets;
      const hasValueChanged = !secretExists || vaultSecrets[destinationConfig.secretName].value !== secretValue;

      if (hasValueChanged) {
        await setSecretAzureKeyVault(accessToken, secretSync, [], {
          key: destinationConfig.secretName,
          value: secretValue
        });
      }

      return;
    }

    // One-to-One mapping (default)
    const { vaultSecrets, disabledAzureKeyVaultSecretKeys } = await $getAzureKeyVaultSecrets(
      accessToken,
      secretSync.destinationConfig.vaultBaseUrl,
      { disableCertificateImport: secretSync.syncOptions.disableCertificateImport }
    );

    const setSecrets: {
      key: string;
      value: string;
    }[] = [];

    const deleteSecrets: string[] = [];

    Object.keys(secretMap).forEach((infisicalKey) => {
      const hyphenatedKey = infisicalKey.replaceAll("_", "-");
      if (!(hyphenatedKey in vaultSecrets)) {
        setSecrets.push({
          key: hyphenatedKey,
          value: secretMap[infisicalKey].value
        });
      } else if (secretMap[infisicalKey].value !== vaultSecrets[hyphenatedKey].value) {
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

    for await (const setSecret of setSecrets) {
      const { key, value } = setSecret;
      await setSecretAzureKeyVault(accessToken, secretSync, disabledAzureKeyVaultSecretKeys, {
        key,
        value
      });
    }

    if (secretSync.syncOptions.disableSecretDeletion) return;

    for await (const deleteSecretKey of deleteSecrets.filter(
      (secret) =>
        matchesSchema(secret, secretSync.environment?.slug || "", secretSync.syncOptions.keySchema) &&
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
    const { destinationConfig } = secretSync;

    if (destinationConfig.mappingBehavior === AzureKeyVaultSyncMappingBehavior.ManyToOne) {
      try {
        await request.delete(
          `${destinationConfig.vaultBaseUrl}/secrets/${destinationConfig.secretName}?api-version=7.3`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`
            }
          }
        );
      } catch (err) {
        if (err instanceof AxiosError && err.response?.status === 404) {
          return;
        }
        throw err;
      }
      return;
    }

    const { vaultSecrets, disabledAzureKeyVaultSecretKeys } = await $getAzureKeyVaultSecrets(
      accessToken,
      secretSync.destinationConfig.vaultBaseUrl,
      { disableCertificateImport: secretSync.syncOptions.disableCertificateImport }
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
    const { destinationConfig } = secretSync;

    const { vaultSecrets, disabledAzureKeyVaultSecretKeys } = await $getAzureKeyVaultSecrets(
      accessToken,
      destinationConfig.vaultBaseUrl,
      { disableCertificateImport: secretSync.syncOptions.disableCertificateImport }
    );

    if (destinationConfig.mappingBehavior === AzureKeyVaultSyncMappingBehavior.ManyToOne) {
      const secretValueEntry = vaultSecrets[destinationConfig.secretName];

      if (!secretValueEntry) return {};

      try {
        const parsedValue = (secretValueEntry.value ? JSON.parse(secretValueEntry.value) : {}) as Record<
          string,
          unknown
        >;

        return Object.fromEntries(
          Object.entries(parsedValue)
            .filter(([, value]) => value !== null && typeof value !== "object")
            .map(([key, value]) => [key, { value: String(value) }])
        );
      } catch {
        throw new SecretSyncError({
          message:
            "Failed to import secrets. Invalid format for Many-to-One mapping behavior: requires key/value JSON configuration.",
          shouldRetry: false
        });
      }
    }

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
