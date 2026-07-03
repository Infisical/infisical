/* eslint-disable no-await-in-loop */
import { request } from "@app/lib/config/request";
import { getGiteaAPIBaseUrl, makePaginatedGiteaRequest } from "@app/services/app-connection/gitea";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import { SecretSyncError } from "../secret-sync-errors";
import { SECRET_SYNC_NAME_MAP } from "../secret-sync-maps";
import { GiteaSyncScope } from "./gitea-sync-enums";
import { TGiteaSecret, TGiteaSyncWithCredentials } from "./gitea-sync-types";

const getAllSecrets = async (secretSync: TGiteaSyncWithCredentials) => {
  const { connection, destinationConfig } = secretSync;
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

  return makePaginatedGiteaRequest<TGiteaSecret>(connection, path);
};

const putSecret = async (secretSync: TGiteaSyncWithCredentials, name: string, value: string) => {
  const { connection, destinationConfig } = secretSync;
  const { personalAccessToken } = connection.credentials;
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
        Authorization: `Bearer ${personalAccessToken}`,
        Accept: "application/json"
      }
    }
  );
};

const deleteSecret = async (secretSync: TGiteaSyncWithCredentials, name: string) => {
  const { connection, destinationConfig } = secretSync;
  const { personalAccessToken } = connection.credentials;
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
      Authorization: `Bearer ${personalAccessToken}`,
      Accept: "application/json"
    }
  });
};

export const GiteaSyncFns = {
  syncSecrets: async (secretSync: TGiteaSyncWithCredentials, ogSecretMap: TSecretMap) => {
    const secretMap = Object.fromEntries(
      Object.entries(ogSecretMap).map(([name, value]) => [name.toUpperCase(), value])
    );

    const { environment } = secretSync;
    const currentSecrets = await getAllSecrets(secretSync);

    for (const name of Object.keys(secretMap)) {
      try {
        await putSecret(secretSync, name, secretMap[name].value);
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
          matchesSchema(secret.name, environment?.slug || "", secretSync.syncOptions.keySchema) &&
          !(secret.name in secretMap);

        if (shouldDelete) {
          await deleteSecret(secretSync, secret.name);
        }
      } catch (error) {
        throw new SecretSyncError({
          error,
          secretKey: secret.name
        });
      }
    }
  },

  removeSecrets: async (secretSync: TGiteaSyncWithCredentials, ogSecretMap: TSecretMap) => {
    const secretMap = Object.fromEntries(
      Object.entries(ogSecretMap).map(([name, value]) => [name.toUpperCase(), value])
    );

    const currentSecrets = await getAllSecrets(secretSync);
    const secretsToDelete = currentSecrets.map((secret) => secret.name).filter((name) => name in secretMap);

    await Promise.all(
      secretsToDelete.map(async (name) => {
        try {
          await deleteSecret(secretSync, name);
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
