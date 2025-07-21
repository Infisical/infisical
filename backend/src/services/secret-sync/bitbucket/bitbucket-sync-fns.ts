import { request } from "@app/lib/config/request";
import { createAuthHeader } from "@app/services/app-connection/bitbucket";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";
import {
  TBitbucketListVariables,
  TBitbucketSyncWithCredentials,
  TBitbucketVariable,
  TDeleteBitbucketVariable,
  TPutBitbucketVariable
} from "@app/services/secret-sync/bitbucket/bitbucket-sync-types";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import { SECRET_SYNC_NAME_MAP } from "../secret-sync-maps";

const buildVariablesUrl = (workspace: string, repository: string, environment?: string, uuid?: string): string => {
  const baseUrl = `${IntegrationUrls.BITBUCKET_API_URL}/2.0/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(repository)}`;

  if (environment) {
    return `${baseUrl}/deployments_config/environments/${environment}/variables/${uuid || ""}`;
  }

  return `${baseUrl}/pipelines_config/variables/${uuid || ""}`;
};

const listVariables = async ({
  workspaceSlug,
  repositorySlug,
  environmentId,
  authHeader
}: TBitbucketListVariables): Promise<TBitbucketVariable[]> => {
  const url = buildVariablesUrl(workspaceSlug, repositorySlug, environmentId);

  const { data } = await request.get<{ values: TBitbucketVariable[] }>(url, {
    headers: {
      Authorization: authHeader,
      Accept: "application/json"
    }
  });

  return data.values;
};

const upsertVariable = async ({
  workspaceSlug,
  repositorySlug,
  environmentId,
  key,
  value,
  existingVariables,
  authHeader
}: {
  workspaceSlug: string;
  repositorySlug: string;
  environmentId?: string;
  key: string;
  value: string;
  existingVariables: TBitbucketVariable[];
  authHeader: string;
}) => {
  const existingVariable = existingVariables.find((variable) => variable.key === key);
  const requestData = { key, value, secured: true };
  const headers = {
    Authorization: authHeader,
    "Content-Type": "application/json"
  };

  if (existingVariable) {
    const url = buildVariablesUrl(workspaceSlug, repositorySlug, environmentId, existingVariable.uuid);
    return request.put(url, requestData, { headers });
  }

  const url = buildVariablesUrl(workspaceSlug, repositorySlug, environmentId);
  return request.post(url, requestData, { headers });
};

const putVariables = async ({
  workspaceSlug,
  repositorySlug,
  environmentId,
  secretMap,
  authHeader
}: TPutBitbucketVariable & { secretMap: TSecretMap; authHeader: string }) => {
  const existingVariables = await listVariables({
    workspaceSlug,
    repositorySlug,
    environmentId,
    authHeader
  });

  const promises = Object.entries(secretMap).map(([key, { value }]) =>
    upsertVariable({
      workspaceSlug,
      repositorySlug,
      environmentId,
      key,
      value,
      existingVariables,
      authHeader
    })
  );

  return Promise.all(promises);
};

const deleteVariables = async ({
  workspaceSlug,
  repositorySlug,
  environmentId,
  keys,
  authHeader
}: TDeleteBitbucketVariable) => {
  const existingVariables = await listVariables({
    workspaceSlug,
    repositorySlug,
    environmentId,
    authHeader
  });

  const variablesToDelete = existingVariables.filter((variable) => keys.includes(variable.key));
  const promises = variablesToDelete.map((variable) => {
    const url = buildVariablesUrl(workspaceSlug, repositorySlug, environmentId, variable.uuid);
    return request.delete(url, {
      headers: { Authorization: authHeader }
    });
  });

  return Promise.all(promises);
};

export const BitbucketSyncFns = {
  syncSecrets: async (secretSync: TBitbucketSyncWithCredentials, secretMap: TSecretMap) => {
    const {
      connection,
      environment,
      destinationConfig: { workspaceSlug, repositorySlug, environmentId }
    } = secretSync;

    const { email, apiToken } = connection.credentials;
    const authHeader = createAuthHeader(email, apiToken);

    try {
      await putVariables({
        workspaceSlug,
        repositorySlug,
        environmentId,
        secretMap,
        authHeader
      });
    } catch (error) {
      throw new SecretSyncError({ error });
    }

    if (secretSync.syncOptions.disableSecretDeletion) return;

    try {
      const existingVariables = await listVariables({
        workspaceSlug,
        repositorySlug,
        environmentId,
        authHeader
      });

      const keysToDelete = existingVariables
        .map((variable) => variable.key)
        .filter(
          (secret) =>
            matchesSchema(secret, environment?.slug || "", secretSync.syncOptions.keySchema) && !(secret in secretMap)
        );

      if (keysToDelete.length > 0) {
        await deleteVariables({
          workspaceSlug,
          repositorySlug,
          environmentId,
          keys: keysToDelete,
          authHeader
        });
      }
    } catch (error) {
      throw new SecretSyncError({ error });
    }
  },

  removeSecrets: async (secretSync: TBitbucketSyncWithCredentials, secretMap: TSecretMap) => {
    const {
      connection,
      destinationConfig: { workspaceSlug, repositorySlug, environmentId }
    } = secretSync;

    const { email, apiToken } = connection.credentials;
    const authHeader = createAuthHeader(email, apiToken);

    try {
      const existingVariables = await listVariables({
        workspaceSlug,
        repositorySlug,
        environmentId,
        authHeader
      });

      const keysToRemove = existingVariables.map((variable) => variable.key).filter((secret) => secret in secretMap);

      if (keysToRemove.length > 0) {
        await deleteVariables({
          workspaceSlug,
          repositorySlug,
          environmentId,
          keys: keysToRemove,
          authHeader
        });
      }
    } catch (error) {
      throw new SecretSyncError({ error });
    }
  },

  getSecrets: async (secretSync: TBitbucketSyncWithCredentials): Promise<TSecretMap> => {
    throw new Error(`${SECRET_SYNC_NAME_MAP[secretSync.destination]} does not support importing secrets.`);
  }
};
