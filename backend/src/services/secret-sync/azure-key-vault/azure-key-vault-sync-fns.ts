/* eslint-disable no-await-in-loop */
import { AxiosError } from "axios";

import { TGatewayServiceFactory } from "@app/ee/services/gateway/gateway-service";
import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import {
  getAzureConnectionAccessToken,
  requestWithAzureKeyVaultGateway
} from "@app/services/app-connection/azure-key-vault/azure-key-vault-connection-fns";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import { SecretSyncError } from "../secret-sync-errors";
import { GetAzureKeyVaultSecret, TAzureKeyVaultSyncWithCredentials } from "./azure-key-vault-sync-types";

type TAzureKeyVaultSyncFactoryDeps = {
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById" | "updateById">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">;
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
  gatewayPoolService: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">;
};

// the effective gateway is resolved up front, so callers thread a connection that only carries a gatewayId
type TGatewayConnection = { gatewayId?: string | null; gatewayPoolId?: string | null };

const AZURE_KEY_VAULT_CERTIFICATE_CONTENT_TYPES = ["application/x-pkcs12", "application/x-pem-file"];

export const azureKeyVaultSyncFactory = ({
  kmsService,
  appConnectionDAL,
  gatewayService,
  gatewayV2Service,
  gatewayPoolService
}: TAzureKeyVaultSyncFactoryDeps) => {
  const $getAzureKeyVaultSecrets = async (
    accessToken: string,
    vaultBaseUrl: string,
    gatewayConnection: TGatewayConnection,
    { disableCertificateImport = false }: { disableCertificateImport?: boolean } = {}
  ) => {
    const paginateAzureKeyVaultSecrets = async () => {
      let result: GetAzureKeyVaultSecret[] = [];

      let currentUrl = `${vaultBaseUrl}/secrets?api-version=7.3`;

      while (currentUrl) {
        const res = await requestWithAzureKeyVaultGateway<{ value: GetAzureKeyVaultSecret; nextLink: string }>(
          gatewayConnection,
          gatewayService,
          gatewayV2Service,
          {
            method: "GET",
            url: currentUrl,
            headers: {
              Authorization: `Bearer ${accessToken}`
            }
          }
        );

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

          const azureKeyVaultSecret = await requestWithAzureKeyVaultGateway<GetAzureKeyVaultSecret>(
            gatewayConnection,
            gatewayService,
            gatewayV2Service,
            {
              method: "GET",
              url: `${getAzureKeyVaultSecret.id}?api-version=7.3`,
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
    const { connection } = secretSync;

    const effectiveGatewayId = await gatewayPoolService.resolveEffectiveGatewayId({
      gatewayId: connection.gatewayId,
      gatewayPoolId: connection.gatewayPoolId
    });
    const gatewayConnection: TGatewayConnection = { gatewayId: effectiveGatewayId, gatewayPoolId: null };

    const { accessToken } = await getAzureConnectionAccessToken(connection.id, appConnectionDAL, kmsService);

    const { vaultSecrets, disabledAzureKeyVaultSecretKeys } = await $getAzureKeyVaultSecrets(
      accessToken,
      secretSync.destinationConfig.vaultBaseUrl,
      gatewayConnection,
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
          await requestWithAzureKeyVaultGateway(gatewayConnection, gatewayService, gatewayV2Service, {
            method: "PUT",
            url: `${secretSync.destinationConfig.vaultBaseUrl}/secrets/${key}?api-version=7.3`,
            data: {
              value
            },
            headers: {
              Authorization: `Bearer ${accessToken}`
            }
          });

          isSecretSet = true;
        } catch (err) {
          syncError = err as Error;
          if (err instanceof AxiosError) {
            // eslint-disable-next-line
            if (err.response?.data?.error?.innererror?.code === "ObjectIsDeletedButRecoverable") {
              await requestWithAzureKeyVaultGateway(gatewayConnection, gatewayService, gatewayV2Service, {
                method: "POST",
                url: `${secretSync.destinationConfig.vaultBaseUrl}/deletedsecrets/${key}/recover?api-version=7.3`,
                data: {},
                headers: {
                  Authorization: `Bearer ${accessToken}`
                }
              });

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
        matchesSchema(secret, secretSync.environment?.slug || "", secretSync.syncOptions.keySchema) &&
        !setSecrets.find((setSecret) => setSecret.key === secret)
    )) {
      await requestWithAzureKeyVaultGateway(gatewayConnection, gatewayService, gatewayV2Service, {
        method: "DELETE",
        url: `${secretSync.destinationConfig.vaultBaseUrl}/secrets/${deleteSecretKey}?api-version=7.3`,
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });
    }
  };

  const removeSecrets = async (secretSync: TAzureKeyVaultSyncWithCredentials, secretMap: TSecretMap) => {
    const { connection } = secretSync;

    const effectiveGatewayId = await gatewayPoolService.resolveEffectiveGatewayId({
      gatewayId: connection.gatewayId,
      gatewayPoolId: connection.gatewayPoolId
    });
    const gatewayConnection: TGatewayConnection = { gatewayId: effectiveGatewayId, gatewayPoolId: null };

    const { accessToken } = await getAzureConnectionAccessToken(connection.id, appConnectionDAL, kmsService);

    const { vaultSecrets, disabledAzureKeyVaultSecretKeys } = await $getAzureKeyVaultSecrets(
      accessToken,
      secretSync.destinationConfig.vaultBaseUrl,
      gatewayConnection,
      { disableCertificateImport: secretSync.syncOptions.disableCertificateImport }
    );

    for await (const [key] of Object.entries(vaultSecrets)) {
      const underscoredKey = key.replaceAll("-", "_");

      if (underscoredKey in secretMap) {
        if (!disabledAzureKeyVaultSecretKeys.includes(underscoredKey)) {
          await requestWithAzureKeyVaultGateway(gatewayConnection, gatewayService, gatewayV2Service, {
            method: "DELETE",
            url: `${secretSync.destinationConfig.vaultBaseUrl}/secrets/${key}?api-version=7.3`,
            headers: {
              Authorization: `Bearer ${accessToken}`
            }
          });
        }
      }
    }
  };

  const getSecrets = async (secretSync: TAzureKeyVaultSyncWithCredentials) => {
    const { connection } = secretSync;

    const effectiveGatewayId = await gatewayPoolService.resolveEffectiveGatewayId({
      gatewayId: connection.gatewayId,
      gatewayPoolId: connection.gatewayPoolId
    });
    const gatewayConnection: TGatewayConnection = { gatewayId: effectiveGatewayId, gatewayPoolId: null };

    const { accessToken } = await getAzureConnectionAccessToken(connection.id, appConnectionDAL, kmsService);

    const { vaultSecrets, disabledAzureKeyVaultSecretKeys } = await $getAzureKeyVaultSecrets(
      accessToken,
      secretSync.destinationConfig.vaultBaseUrl,
      gatewayConnection,
      { disableCertificateImport: secretSync.syncOptions.disableCertificateImport }
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
