import { Octokit } from "@octokit/rest";
import sodium from "libsodium-wrappers";

import { getGitHubClient } from "@app/services/app-connection/github";
import { GitHubSyncScope, GitHubSyncVisibility } from "@app/services/secret-sync/github/github-sync-enums";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { SECRET_SYNC_NAME_MAP } from "@app/services/secret-sync/secret-sync-maps";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import { TGitHubPublicKey, TGitHubSecret, TGitHubSecretPayload, TGitHubSyncWithCredentials } from "./github-sync-types";

// TODO: rate limit handling

const getEncryptedSecrets = async (client: Octokit, secretSync: TGitHubSyncWithCredentials) => {
  let encryptedSecrets: TGitHubSecret[];

  const { destinationConfig } = secretSync;

  switch (destinationConfig.scope) {
    case GitHubSyncScope.Organization: {
      encryptedSecrets = await client.paginate("GET /orgs/{org}/actions/secrets", {
        org: destinationConfig.org
      });
      break;
    }
    case GitHubSyncScope.Repository: {
      encryptedSecrets = await client.paginate("GET /repos/{owner}/{repo}/actions/secrets", {
        owner: destinationConfig.owner,
        repo: destinationConfig.repo
      });

      break;
    }
    case GitHubSyncScope.RepositoryEnvironment:
    default: {
      encryptedSecrets = await client.paginate("GET /repos/{owner}/{repo}/environments/{environment_name}/secrets", {
        owner: destinationConfig.owner,
        repo: destinationConfig.repo,
        environment_name: destinationConfig.env
      });
      break;
    }
  }

  return encryptedSecrets;
};

const getPublicKey = async (client: Octokit, secretSync: TGitHubSyncWithCredentials) => {
  let publicKey: TGitHubPublicKey;

  const { destinationConfig } = secretSync;

  switch (destinationConfig.scope) {
    case GitHubSyncScope.Organization: {
      publicKey = (
        await client.request("GET /orgs/{org}/actions/secrets/public-key", {
          org: destinationConfig.org
        })
      ).data;
      break;
    }
    case GitHubSyncScope.Repository: {
      publicKey = (
        await client.request("GET /repos/{owner}/{repo}/actions/secrets/public-key", {
          owner: destinationConfig.owner,
          repo: destinationConfig.repo
        })
      ).data;
      break;
    }
    case GitHubSyncScope.RepositoryEnvironment:
    default: {
      publicKey = (
        await client.request("GET /repos/{owner}/{repo}/environments/{environment_name}/secrets/public-key", {
          owner: destinationConfig.owner,
          repo: destinationConfig.repo,
          environment_name: destinationConfig.env
        })
      ).data;
      break;
    }
  }

  return publicKey;
};

const deleteSecret = async (
  client: Octokit,
  secretSync: TGitHubSyncWithCredentials,
  encryptedSecret: TGitHubSecret
) => {
  const { destinationConfig } = secretSync;

  switch (destinationConfig.scope) {
    case GitHubSyncScope.Organization: {
      await client.request(`DELETE /orgs/{org}/actions/secrets/{secret_name}`, {
        org: destinationConfig.org,
        secret_name: encryptedSecret.name
      });
      break;
    }
    case GitHubSyncScope.Repository: {
      await client.request("DELETE /repos/{owner}/{repo}/actions/secrets/{secret_name}", {
        owner: destinationConfig.owner,
        repo: destinationConfig.repo,
        secret_name: encryptedSecret.name
      });
      break;
    }
    case GitHubSyncScope.RepositoryEnvironment:
    default: {
      await client.request("DELETE /repos/{owner}/{repo}/environments/{environment_name}/secrets/{secret_name}", {
        owner: destinationConfig.owner,
        repo: destinationConfig.repo,
        environment_name: destinationConfig.env,
        secret_name: encryptedSecret.name
      });
      break;
    }
  }
};

const putSecret = async (client: Octokit, secretSync: TGitHubSyncWithCredentials, payload: TGitHubSecretPayload) => {
  const { destinationConfig } = secretSync;

  switch (destinationConfig.scope) {
    case GitHubSyncScope.Organization: {
      const { visibility, selectedRepositoryIds } = destinationConfig;

      await client.request(`PUT /orgs/{org}/actions/secrets/{secret_name}`, {
        org: destinationConfig.org,
        ...payload,
        visibility,
        ...(visibility === GitHubSyncVisibility.Selected && {
          selected_repository_ids: selectedRepositoryIds
        })
      });
      break;
    }
    case GitHubSyncScope.Repository: {
      await client.request("PUT /repos/{owner}/{repo}/actions/secrets/{secret_name}", {
        owner: destinationConfig.owner,
        repo: destinationConfig.repo,
        ...payload
      });
      break;
    }
    case GitHubSyncScope.RepositoryEnvironment:
    default: {
      await client.request("PUT /repos/{owner}/{repo}/environments/{environment_name}/secrets/{secret_name}", {
        owner: destinationConfig.owner,
        repo: destinationConfig.repo,
        environment_name: destinationConfig.env,
        ...payload
      });
      break;
    }
  }
};

export const GithubSyncFns = {
  syncSecrets: async (secretSync: TGitHubSyncWithCredentials, secretMap: TSecretMap) => {
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

    const client = getGitHubClient(secretSync.connection);

    const encryptedSecrets = await getEncryptedSecrets(client, secretSync);

    const publicKey = await getPublicKey(client, secretSync);

    await sodium.ready.then(async () => {
      for await (const key of Object.keys(secretMap)) {
        // convert secret & base64 key to Uint8Array.
        const binaryKey = sodium.from_base64(publicKey.key, sodium.base64_variants.ORIGINAL);
        const binarySecretValue = sodium.from_string(secretMap[key].value);

        // encrypt secret using libsodium
        const encryptedBytes = sodium.crypto_box_seal(binarySecretValue, binaryKey);

        // convert encrypted Uint8Array to base64
        const encryptedSecretValue = sodium.to_base64(encryptedBytes, sodium.base64_variants.ORIGINAL);

        try {
          await putSecret(client, secretSync, {
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
    });

    if (secretSync.syncOptions.disableSecretDeletion) return;

    for await (const encryptedSecret of encryptedSecrets) {
      if (!matchesSchema(encryptedSecret.name, secretSync.environment?.slug || "", secretSync.syncOptions.keySchema))
        // eslint-disable-next-line no-continue
        continue;

      if (!(encryptedSecret.name in secretMap)) {
        await deleteSecret(client, secretSync, encryptedSecret);
      }
    }
  },
  getSecrets: async (secretSync: TGitHubSyncWithCredentials) => {
    throw new Error(`${SECRET_SYNC_NAME_MAP[secretSync.destination]} does not support importing secrets.`);
  },
  removeSecrets: async (secretSync: TGitHubSyncWithCredentials, secretMap: TSecretMap) => {
    const client = getGitHubClient(secretSync.connection);

    const encryptedSecrets = await getEncryptedSecrets(client, secretSync);

    for await (const encryptedSecret of encryptedSecrets) {
      if (encryptedSecret.name in secretMap) {
        await deleteSecret(client, secretSync, encryptedSecret);
      }
    }
  }
};
