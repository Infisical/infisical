import { Octokit } from "@octokit/rest";
import sodium from "libsodium-wrappers";

import { getGitHubClient } from "@app/services/app-connection/github";
import { GitHubSyncScope } from "@app/services/secret-sync/github/github-sync-enums";
import { SECRET_SYNC_NAME_MAP } from "@app/services/secret-sync/secret-sync-maps";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import { TGitHubSyncWithCredentials } from "./github-sync-types";

interface GitHubSecret {
  name: string;
  created_at: string;
  updated_at: string;
  visibility?: "all" | "private" | "selected";
  selected_repositories_url?: string | undefined;
}

// TODO: rate limit handling

const getEncryptedSecrets = async (client: Octokit, secretSync: TGitHubSyncWithCredentials) => {
  let encryptedSecrets: GitHubSecret[];

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

interface GitHubPublicKey {
  key_id: string;
  key: string;
  id?: number | undefined;
  url?: string | undefined;
  title?: string | undefined;
  created_at?: string | undefined;
}

const getPublicKey = async (client: Octokit, secretSync: TGitHubSyncWithCredentials) => {
  let publicKey: GitHubPublicKey;

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

const deleteSecret = async (client: Octokit, secretSync: TGitHubSyncWithCredentials, encryptedSecret: GitHubSecret) => {
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

interface GitHubSecretPayload {
  key_id: string;
  secret_name: string;
  encrypted_value: string;
}

const putSecret = async (client: Octokit, secretSync: TGitHubSyncWithCredentials, payload: GitHubSecretPayload) => {
  const { destinationConfig } = secretSync;

  switch (destinationConfig.scope) {
    case GitHubSyncScope.Organization: {
      const { visibility, selectedRepositoryIds } = destinationConfig;

      await client.request(`PUT /orgs/{org}/actions/secrets/{secret_name}`, {
        org: destinationConfig.org,
        ...payload,
        visibility,
        selected_repository_ids: selectedRepositoryIds
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
  syncSecrets: async (secretSync: TGitHubSyncWithCredentials, affixedSecretMap: TSecretMap) => {
    const client = getGitHubClient(secretSync.connection);

    const encryptedSecrets = await getEncryptedSecrets(client, secretSync);

    const publicKey = await getPublicKey(client, secretSync);

    for await (const encryptedSecret of encryptedSecrets) {
      if (!(encryptedSecret.name in affixedSecretMap)) {
        await deleteSecret(client, secretSync, encryptedSecret);
      }
    }

    await sodium.ready.then(async () => {
      for await (const key of Object.keys(affixedSecretMap)) {
        // convert secret & base64 key to Uint8Array.
        const binaryKey = sodium.from_base64(publicKey.key, sodium.base64_variants.ORIGINAL);
        const binarySecretValue = sodium.from_string(affixedSecretMap[key].value);

        // encrypt secret using libsodium
        const encryptedBytes = sodium.crypto_box_seal(binarySecretValue, binaryKey);

        // convert encrypted Uint8Array to base64
        const encryptedSecretValue = sodium.to_base64(encryptedBytes, sodium.base64_variants.ORIGINAL);

        await putSecret(client, secretSync, {
          secret_name: key,
          encrypted_value: encryptedSecretValue,
          key_id: publicKey.key_id
        });
      }
    });
  },
  importSecrets: async (secretSync: TGitHubSyncWithCredentials) => {
    throw new Error(`${SECRET_SYNC_NAME_MAP[secretSync.destination]} does not support importing secrets.`);
  },
  removeSecrets: async (secretSync: TGitHubSyncWithCredentials, affixedSecretMap: TSecretMap) => {
    const client = getGitHubClient(secretSync.connection);

    const encryptedSecrets = await getEncryptedSecrets(client, secretSync);

    for await (const encryptedSecret of encryptedSecrets) {
      if (encryptedSecret.name in affixedSecretMap) {
        await deleteSecret(client, secretSync, encryptedSecret);
      }
    }
  }
};
