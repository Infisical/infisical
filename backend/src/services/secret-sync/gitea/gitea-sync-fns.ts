/* eslint-disable no-await-in-loop */
/* eslint-disable no-continue */
import { AxiosError, isAxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { removeTrailingSlash } from "@app/lib/fn";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator/validate-url";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import { SECRET_SYNC_NAME_MAP } from "../secret-sync-maps";
import { TGiteaSecret, TGiteaSyncWithCredentials } from "./gitea-sync-types";

const GITEA_PAGE_SIZE = 50;
const GITEA_MAX_PAGES = 50;

const giteaApiHeaders = (accessToken: string) => ({
  Authorization: `token ${accessToken}`,
  Accept: "application/json"
});

const buildGiteaSecretsUrl = (instanceUrl: string, owner: string, repo: string, secretName?: string): string => {
  const base = `${removeTrailingSlash(instanceUrl)}/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/secrets`;
  return secretName ? `${base}/${encodeURIComponent(secretName)}` : base;
};

// Lists all action secrets for a repo (names only — Gitea never returns values).
// See: https://docs.gitea.com/api/1.20/#tag/repository/operation/repoListActionsSecrets
const listGiteaRepoSecrets = async (
  instanceUrl: string,
  accessToken: string,
  owner: string,
  repo: string
): Promise<TGiteaSecret[]> => {
  const headers = giteaApiHeaders(accessToken);
  const allSecrets: TGiteaSecret[] = [];
  let page = 1;
  let iterationCount = 0;

  while (iterationCount < GITEA_MAX_PAGES) {
    const url = `${buildGiteaSecretsUrl(instanceUrl, owner, repo)}?page=${page}&limit=${GITEA_PAGE_SIZE}`;

    const { data } = await request.get<TGiteaSecret[]>(url, { headers });
    const pageData = Array.isArray(data) ? data : [];

    allSecrets.push(...pageData);

    if (pageData.length < GITEA_PAGE_SIZE) break;

    page += 1;
    iterationCount += 1;
  }

  return allSecrets;
};

// Upsert (Gitea POST is idempotent — creates or updates).
// See: https://docs.gitea.com/api/1.20/#tag/repository/operation/updateRepoSecret
// Upsert via PUT (Gitea idempotent create-or-update — same shape as GitHub Actions).
// See: https://docs.gitea.com/api/1.26/#tag/repository/operation/updateRepoSecret
const upsertGiteaSecret = async (
  instanceUrl: string,
  accessToken: string,
  owner: string,
  repo: string,
  name: string,
  data: string
): Promise<void> => {
  const headers = { ...giteaApiHeaders(accessToken), "Content-Type": "application/json" };

  await request.put(buildGiteaSecretsUrl(instanceUrl, owner, repo, name), { data }, { headers });
};

const deleteGiteaSecret = async (
  instanceUrl: string,
  accessToken: string,
  owner: string,
  repo: string,
  name: string
): Promise<void> => {
  const headers = giteaApiHeaders(accessToken);
  await request.delete(buildGiteaSecretsUrl(instanceUrl, owner, repo, name), { headers });
};

export const GiteaSyncFns = {
  async getSecrets(secretSync: TGiteaSyncWithCredentials): Promise<TSecretMap> {
    throw new Error(`${SECRET_SYNC_NAME_MAP[secretSync.destination]} does not support importing secrets.`);
  },

  async syncSecrets(secretSync: TGiteaSyncWithCredentials, secretMap: TSecretMap): Promise<void> {
    const {
      connection: {
        credentials: { instanceUrl, accessToken }
      },
      destinationConfig,
      environment,
      syncOptions: { disableSecretDeletion, keySchema }
    } = secretSync;

    await blockLocalAndPrivateIpAddresses(instanceUrl);

    const { owner, repo } = destinationConfig;

    const existingSecrets = await listGiteaRepoSecrets(instanceUrl, accessToken, owner, repo);
    const existingByName = new Set(existingSecrets.map((s) => s.name));

    for (const key of Object.keys(secretMap)) {
      try {
        await upsertGiteaSecret(instanceUrl, accessToken, owner, repo, key, secretMap[key].value);
      } catch (error) {
        throw new SecretSyncError({ error, secretKey: key });
      }
    }

    if (disableSecretDeletion) return;

    for (const existing of existingSecrets) {
      if (!matchesSchema(existing.name, environment?.slug || "", keySchema)) continue;
      if (existing.name in secretMap) continue;
      // Defensive: skip names we never saw (shouldn't happen with the Set, but cheap check).
      if (!existingByName.has(existing.name)) continue;

      try {
        await deleteGiteaSecret(instanceUrl, accessToken, owner, repo, existing.name);
      } catch (error) {
        // Tolerate concurrent deletes — same pattern as removeSecrets below for parity.
        if (isAxiosError(error) && (error as AxiosError).response?.status === 404) continue;
        throw new SecretSyncError({ error, secretKey: existing.name });
      }
    }
  },

  async removeSecrets(secretSync: TGiteaSyncWithCredentials, secretMap: TSecretMap): Promise<void> {
    const {
      connection: {
        credentials: { instanceUrl, accessToken }
      },
      destinationConfig
    } = secretSync;

    await blockLocalAndPrivateIpAddresses(instanceUrl);

    const { owner, repo } = destinationConfig;

    const existingSecrets = await listGiteaRepoSecrets(instanceUrl, accessToken, owner, repo);

    for (const existing of existingSecrets) {
      if (!(existing.name in secretMap)) continue;

      try {
        await deleteGiteaSecret(instanceUrl, accessToken, owner, repo, existing.name);
      } catch (error) {
        if (isAxiosError(error) && (error as AxiosError).response?.status === 404) continue;
        throw new SecretSyncError({ error, secretKey: existing.name });
      }
    }
  }
};
