/* eslint-disable no-await-in-loop */
import { request } from "@app/lib/config/request";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import {
  getGiteaAPIBaseUrl,
  getValidAccessToken,
  makePaginatedGiteaRequest,
  TGiteaAccessToken
} from "@app/services/app-connection/gitea";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import { SecretSyncError } from "../secret-sync-errors";
import { SECRET_SYNC_NAME_MAP } from "../secret-sync-maps";
import { GiteaSyncScope } from "./gitea-sync-enums";
import { TGiteaSecret, TGiteaSyncWithCredentials } from "./gitea-sync-types";

type TGiteaSyncFactoryDeps = {
  appConnectionDAL: Pick<TAppConnectionDALFactory, "updateById">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

const getAllSecrets = async ({
  accessToken,
  secretSync
}: {
  accessToken: TGiteaAccessToken;
  secretSync: TGiteaSyncWithCredentials;
}) => {
  const { connection, destinationConfig } = secretSync;
  const baseUrl = await getGiteaAPIBaseUrl(connection);
  let path: string;

  switch (destinationConfig.scope) {
    case GiteaSyncScope.Organization:
      path = `/orgs/${encodeURIComponent(destinationConfig.org.name)}/actions/secrets`;
      break;
    case GiteaSyncScope.Repository:
    default:
      path = `/repos/${encodeURIComponent(destinationConfig.owner)}/${encodeURIComponent(destinationConfig.repo)}/actions/secrets`;
      break;
  }

  return makePaginatedGiteaRequest<TGiteaSecret>({ url: `${baseUrl}${path}`, accessToken });
};

const putSecret = async ({
  name,
  value,
  accessToken,
  secretSync
}: {
  name: string;
  value: string;
  accessToken: TGiteaAccessToken;
  secretSync: TGiteaSyncWithCredentials;
}) => {
  const { connection, destinationConfig } = secretSync;

  const baseUrl = await getGiteaAPIBaseUrl(connection);
  let path: string;

  switch (destinationConfig.scope) {
    case GiteaSyncScope.Organization:
      path = `/orgs/${encodeURIComponent(destinationConfig.org.name)}/actions/secrets/${encodeURIComponent(name)}`;
      break;
    case GiteaSyncScope.Repository:
    default:
      path = `/repos/${encodeURIComponent(destinationConfig.owner)}/${encodeURIComponent(destinationConfig.repo)}/actions/secrets/${encodeURIComponent(name)}`;
      break;
  }

  await request.put(
    `${baseUrl}${path}`,
    {
      data: value
    },
    {
      headers: {
        Authorization: `${accessToken.prefix} ${accessToken.value}`,
        Accept: "application/json"
      }
    }
  );
};

const deleteSecret = async ({
  name,
  accessToken,
  secretSync
}: {
  name: string;
  accessToken: TGiteaAccessToken;
  secretSync: TGiteaSyncWithCredentials;
}) => {
  const { connection, destinationConfig } = secretSync;

  const baseUrl = await getGiteaAPIBaseUrl(connection);
  let path: string;

  switch (destinationConfig.scope) {
    case GiteaSyncScope.Organization:
      path = `/orgs/${encodeURIComponent(destinationConfig.org.name)}/actions/secrets/${encodeURIComponent(name)}`;
      break;
    case GiteaSyncScope.Repository:
    default:
      path = `/repos/${encodeURIComponent(destinationConfig.owner)}/${encodeURIComponent(destinationConfig.repo)}/actions/secrets/${encodeURIComponent(name)}`;
      break;
  }

  await request.delete(`${baseUrl}${path}`, {
    headers: {
      Authorization: `${accessToken.prefix} ${accessToken.value}`,
      Accept: "application/json"
    }
  });
};

export const GiteaSyncFns = {
  syncSecrets: async (
    secretSync: TGiteaSyncWithCredentials,
    ogSecretMap: TSecretMap,
    { appConnectionDAL, kmsService }: TGiteaSyncFactoryDeps
  ) => {
    const accessToken = await getValidAccessToken({
      appConnection: secretSync.connection,
      appConnectionDAL,
      kmsService
    });

    const currentSecrets = await getAllSecrets({ accessToken, secretSync });

    const secretMap = Object.fromEntries(
      Object.entries(ogSecretMap).map(([name, value]) => [name.toUpperCase(), value])
    );

    for (const name of Object.keys(secretMap)) {
      try {
        await putSecret({ name, value: secretMap[name].value, accessToken, secretSync });
      } catch (error) {
        throw new SecretSyncError({
          error,
          secretKey: name
        });
      }
    }

    if (secretSync.syncOptions.disableSecretDeletion) {
      return;
    }

    for (const secret of currentSecrets) {
      try {
        const shouldDelete =
          matchesSchema(secret.name, secretSync.environment?.slug || "", secretSync.syncOptions.keySchema) &&
          !(secret.name in secretMap);

        if (shouldDelete) {
          await deleteSecret({ name: secret.name, accessToken, secretSync });
        }
      } catch (error) {
        throw new SecretSyncError({
          error,
          secretKey: secret.name
        });
      }
    }
  },

  removeSecrets: async (
    secretSync: TGiteaSyncWithCredentials,
    ogSecretMap: TSecretMap,
    { appConnectionDAL, kmsService }: TGiteaSyncFactoryDeps
  ) => {
    const accessToken = await getValidAccessToken({
      appConnection: secretSync.connection,
      appConnectionDAL,
      kmsService
    });

    const currentSecrets = await getAllSecrets({ accessToken, secretSync });

    const secretMap = Object.fromEntries(
      Object.entries(ogSecretMap).map(([name, value]) => [name.toUpperCase(), value])
    );

    const secretsToDelete = currentSecrets.map((secret) => secret.name).filter((name) => name in secretMap);

    await Promise.all(
      secretsToDelete.map(async (name) => {
        try {
          await deleteSecret({ name, accessToken, secretSync });
        } catch (error) {
          throw new SecretSyncError({
            error,
            secretKey: name
          });
        }
      })
    );
  },

  getSecrets: async (secretSync: TGiteaSyncWithCredentials) => {
    throw new Error(`${SECRET_SYNC_NAME_MAP[secretSync.destination]} does not support importing secrets.`);
  }
};
