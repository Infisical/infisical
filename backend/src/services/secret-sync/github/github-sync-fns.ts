import sodium from "libsodium-wrappers";

import { TGatewayServiceFactory } from "@app/ee/services/gateway/gateway-service";
import {
  getGitHubAppAuthToken,
  GitHubConnectionMethod,
  makePaginatedGitHubRequest,
  requestWithGitHubGateway
} from "@app/services/app-connection/github";
import { GitHubSyncScope, GitHubSyncVisibility } from "@app/services/secret-sync/github/github-sync-enums";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { SECRET_SYNC_NAME_MAP } from "@app/services/secret-sync/secret-sync-maps";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import { TGitHubPublicKey, TGitHubSecret, TGitHubSecretPayload, TGitHubSyncWithCredentials } from "./github-sync-types";

// TODO: rate limit handling

const getEncryptedSecrets = async (
  secretSync: TGitHubSyncWithCredentials,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">
) => {
  const { destinationConfig, connection } = secretSync;

  let path: string;
  switch (destinationConfig.scope) {
    case GitHubSyncScope.Organization: {
      path = `/orgs/${encodeURIComponent(destinationConfig.org)}/actions/secrets`;
      break;
    }
    case GitHubSyncScope.Repository: {
      path = `/repos/${encodeURIComponent(destinationConfig.owner)}/${encodeURIComponent(destinationConfig.repo)}/actions/secrets`;
      break;
    }
    case GitHubSyncScope.RepositoryEnvironment:
    default: {
      path = `/repos/${encodeURIComponent(destinationConfig.owner)}/${encodeURIComponent(destinationConfig.repo)}/environments/${encodeURIComponent(destinationConfig.env)}/secrets`;
      break;
    }
  }

  return makePaginatedGitHubRequest<TGitHubSecret, { secrets: TGitHubSecret[] }>(
    connection,
    gatewayService,
    path,
    (data) => data.secrets
  );
};

const getPublicKey = async (
  secretSync: TGitHubSyncWithCredentials,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  token: string
) => {
  const { destinationConfig, connection } = secretSync;

  let path: string;
  switch (destinationConfig.scope) {
    case GitHubSyncScope.Organization: {
      path = `/orgs/${encodeURIComponent(destinationConfig.org)}/actions/secrets/public-key`;
      break;
    }
    case GitHubSyncScope.Repository: {
      path = `/repos/${encodeURIComponent(destinationConfig.owner)}/${encodeURIComponent(destinationConfig.repo)}/actions/secrets/public-key`;
      break;
    }
    case GitHubSyncScope.RepositoryEnvironment:
    default: {
      path = `/repos/${encodeURIComponent(destinationConfig.owner)}/${encodeURIComponent(destinationConfig.repo)}/environments/${encodeURIComponent(destinationConfig.env)}/secrets/public-key`;
      break;
    }
  }

  const response = await requestWithGitHubGateway<TGitHubPublicKey>(connection, gatewayService, {
    url: `https://api.${connection.credentials.host || "github.com"}${path}`,
    method: "GET",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28"
    }
  });

  return response.data;
};

const deleteSecret = async (
  secretSync: TGitHubSyncWithCredentials,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  token: string,
  encryptedSecret: TGitHubSecret
) => {
  const { destinationConfig, connection } = secretSync;

  let path: string;
  switch (destinationConfig.scope) {
    case GitHubSyncScope.Organization: {
      path = `/orgs/${encodeURIComponent(destinationConfig.org)}/actions/secrets/${encodeURIComponent(encryptedSecret.name)}`;
      break;
    }
    case GitHubSyncScope.Repository: {
      path = `/repos/${encodeURIComponent(destinationConfig.owner)}/${encodeURIComponent(destinationConfig.repo)}/actions/secrets/${encodeURIComponent(encryptedSecret.name)}`;
      break;
    }
    case GitHubSyncScope.RepositoryEnvironment:
    default: {
      path = `/repos/${encodeURIComponent(destinationConfig.owner)}/${encodeURIComponent(destinationConfig.repo)}/environments/${encodeURIComponent(destinationConfig.env)}/secrets/${encodeURIComponent(encryptedSecret.name)}`;
      break;
    }
  }

  await requestWithGitHubGateway(connection, gatewayService, {
    url: `https://api.${connection.credentials.host || "github.com"}${path}`,
    method: "DELETE",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28"
    }
  });
};

const putSecret = async (
  secretSync: TGitHubSyncWithCredentials,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  token: string,
  payload: TGitHubSecretPayload
) => {
  const { destinationConfig, connection } = secretSync;

  let path: string;
  let body: Record<string, string | number[]> = payload;

  switch (destinationConfig.scope) {
    case GitHubSyncScope.Organization: {
      const { visibility, selectedRepositoryIds } = destinationConfig;
      path = `/orgs/${encodeURIComponent(destinationConfig.org)}/actions/secrets/${encodeURIComponent(payload.secret_name)}`;
      body = {
        ...payload,
        visibility,
        ...(visibility === GitHubSyncVisibility.Selected && {
          selected_repository_ids: selectedRepositoryIds
        })
      };
      break;
    }
    case GitHubSyncScope.Repository: {
      path = `/repos/${encodeURIComponent(destinationConfig.owner)}/${encodeURIComponent(destinationConfig.repo)}/actions/secrets/${encodeURIComponent(payload.secret_name)}`;
      break;
    }
    case GitHubSyncScope.RepositoryEnvironment:
    default: {
      path = `/repos/${encodeURIComponent(destinationConfig.owner)}/${encodeURIComponent(destinationConfig.repo)}/environments/${encodeURIComponent(destinationConfig.env)}/secrets/${encodeURIComponent(payload.secret_name)}`;
      break;
    }
  }

  await requestWithGitHubGateway(connection, gatewayService, {
    url: `https://api.${connection.credentials.host || "github.com"}${path}`,
    method: "PUT",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28"
    },
    data: body
  });
};

export const GithubSyncFns = {
  syncSecrets: async (
    secretSync: TGitHubSyncWithCredentials,
    ogSecretMap: TSecretMap,
    gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">
  ) => {
    const secretMap = Object.fromEntries(Object.entries(ogSecretMap).map(([i, v]) => [i.toUpperCase(), v]));

    switch (secretSync.destinationConfig.scope) {
      case GitHubSyncScope.Organization:
        if (Object.values(secretMap).length > 1000) {
          throw new SecretSyncError({
            message: "GitHub does not support storing more than 1,000 secrets at the organization level.",
            shouldRetry: false
          });
        }
        break;
      case GitHubSyncScope.Repository:
      case GitHubSyncScope.RepositoryEnvironment:
        if (Object.values(secretMap).length > 100) {
          throw new SecretSyncError({
            message: "GitHub does not support storing more than 100 secrets at the repository level.",
            shouldRetry: false
          });
        }
        break;
      default:
        throw new Error(
          `Unsupported GitHub Sync scope ${
            (secretSync.destinationConfig as TGitHubSyncWithCredentials["destinationConfig"]).scope
          }`
        );
    }

    const { connection } = secretSync;
    const token =
      connection.method === GitHubConnectionMethod.OAuth
        ? connection.credentials.accessToken
        : await getGitHubAppAuthToken(connection);

    const encryptedSecrets = await getEncryptedSecrets(secretSync, gatewayService);
    const publicKey = await getPublicKey(secretSync, gatewayService, token);

    await sodium.ready;
    for await (const key of Object.keys(secretMap)) {
      // convert secret & base64 key to Uint8Array.
      const binaryKey = sodium.from_base64(publicKey.key, sodium.base64_variants.ORIGINAL);
      const binarySecretValue = sodium.from_string(secretMap[key].value);

      // encrypt secret using libsodium
      const encryptedBytes = sodium.crypto_box_seal(binarySecretValue, binaryKey);

      // convert encrypted Uint8Array to base64
      const encryptedSecretValue = sodium.to_base64(encryptedBytes, sodium.base64_variants.ORIGINAL);

      try {
        await putSecret(secretSync, gatewayService, token, {
          secret_name: key,
          encrypted_value: encryptedSecretValue,
          key_id: publicKey.key_id
        });
      } catch (error) {
        throw new SecretSyncError({
          error,
          secretKey: key
        });
      }
    }

    if (secretSync.syncOptions.disableSecretDeletion) return;

    for await (const encryptedSecret of encryptedSecrets) {
      if (!matchesSchema(encryptedSecret.name, secretSync.environment?.slug || "", secretSync.syncOptions.keySchema))
        // eslint-disable-next-line no-continue
        continue;

      if (!(encryptedSecret.name in secretMap)) {
        await deleteSecret(secretSync, gatewayService, token, encryptedSecret);
      }
    }
  },
  getSecrets: async (secretSync: TGitHubSyncWithCredentials) => {
    throw new Error(`${SECRET_SYNC_NAME_MAP[secretSync.destination]} does not support importing secrets.`);
  },
  removeSecrets: async (
    secretSync: TGitHubSyncWithCredentials,
    ogSecretMap: TSecretMap,
    gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">
  ) => {
    const secretMap = Object.fromEntries(Object.entries(ogSecretMap).map(([i, v]) => [i.toUpperCase(), v]));

    const { connection } = secretSync;
    const token =
      connection.method === GitHubConnectionMethod.OAuth
        ? connection.credentials.accessToken
        : await getGitHubAppAuthToken(connection);

    const encryptedSecrets = await getEncryptedSecrets(secretSync, gatewayService);

    for await (const encryptedSecret of encryptedSecrets) {
      if (encryptedSecret.name in secretMap) {
        await deleteSecret(secretSync, gatewayService, token, encryptedSecret);
      }
    }
  }
};
