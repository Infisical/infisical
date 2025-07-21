import { request } from "@app/lib/config/request";
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

const createAuthHeader = (email: string, apiToken: string): string => {
  return `Basic ${Buffer.from(`${email}:${apiToken}`).toString("base64")}`;
};

const buildVariablesUrl = (workspace: string, repository: string, environment?: string, uuid?: string): string => {
  const baseUrl = `${IntegrationUrls.BITBUCKET_API_URL}/2.0/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(repository)}`;

  if (environment) {
    return `${baseUrl}/deployments_config/environments/${environment}/variables${uuid ? `/${uuid}` : ""}`;
  }

  return `${baseUrl}/pipelines_config/variables/${uuid || ""}`;
};

const listVariables = async ({
  email,
  apiToken,
  workspace,
  repository,
  environment
}: TBitbucketListVariables & { environment?: string }): Promise<TBitbucketVariable[]> => {
  const url = buildVariablesUrl(workspace, repository, environment);
  const authHeader = createAuthHeader(email, apiToken);

  const { data } = await request.get<{ values: TBitbucketVariable[] }>(url, {
    headers: {
      Authorization: authHeader,
      Accept: "application/json"
    }
  });

  return data.values;
};

const upsertVariable = async ({
  email,
  apiToken,
  workspace,
  repository,
  environment,
  key,
  value,
  existingVariables
}: {
  email: string;
  apiToken: string;
  workspace: string;
  repository: string;
  environment?: string;
  key: string;
  value: string;
  existingVariables: TBitbucketVariable[];
}) => {
  const existingVariable = existingVariables.find((variable) => variable.key === key);
  const authHeader = createAuthHeader(email, apiToken);
  const requestData = { key, value, secured: true };
  const headers = {
    Authorization: authHeader,
    "Content-Type": "application/json"
  };

  if (existingVariable) {
    const url = buildVariablesUrl(workspace, repository, environment, existingVariable.uuid);
    return request.put(url, requestData, { headers });
  }

  const url = buildVariablesUrl(workspace, repository, environment);
  return request.post(url, requestData, { headers });
};

const putVariables = async ({
  email,
  apiToken,
  workspace,
  repository,
  environment,
  secretMap
}: TPutBitbucketVariable & { environment?: string; secretMap: TSecretMap }) => {
  const existingVariables = await listVariables({
    email,
    apiToken,
    workspace,
    repository,
    environment
  });

  const promises = Object.entries(secretMap).map(([key, { value }]) =>
    upsertVariable({
      email,
      apiToken,
      workspace,
      repository,
      environment,
      key,
      value,
      existingVariables
    })
  );

  return Promise.all(promises);
};

const deleteVariables = async ({
  email,
  apiToken,
  workspace,
  repository,
  environment,
  keys
}: TDeleteBitbucketVariable & { environment?: string }) => {
  const existingVariables = await listVariables({
    email,
    apiToken,
    workspace,
    repository,
    environment
  });

  const variablesToDelete = existingVariables.filter((variable) => keys.includes(variable.key));

  const authHeader = createAuthHeader(email, apiToken);
  const promises = variablesToDelete.map((variable) => {
    const url = buildVariablesUrl(workspace, repository, environment, variable.uuid);
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
      destinationConfig: { workspace, repository, environment: configEnvironment }
    } = secretSync;

    const { email, apiToken } = connection.credentials;

    try {
      await putVariables({
        email,
        apiToken,
        workspace,
        repository,
        environment: configEnvironment,
        secretMap
      });
    } catch (error) {
      throw new SecretSyncError({ error });
    }

    if (secretSync.syncOptions.disableSecretDeletion) return;

    try {
      const existingVariables = await listVariables({
        email,
        apiToken,
        workspace,
        repository,
        environment: configEnvironment
      });

      const keysToDelete = existingVariables
        .map((variable) => variable.key)
        .filter(
          (secret) =>
            matchesSchema(secret, environment?.slug || "", secretSync.syncOptions.keySchema) && !(secret in secretMap)
        );

      if (keysToDelete.length > 0) {
        await deleteVariables({
          email,
          apiToken,
          workspace,
          repository,
          environment: configEnvironment,
          keys: keysToDelete
        });
      }
    } catch (error) {
      throw new SecretSyncError({ error });
    }
  },

  removeSecrets: async (secretSync: TBitbucketSyncWithCredentials, secretMap: TSecretMap) => {
    const {
      connection,
      destinationConfig: { workspace, repository, environment: configEnvironment }
    } = secretSync;

    const { email, apiToken } = connection.credentials;

    try {
      const existingVariables = await listVariables({
        email,
        apiToken,
        workspace,
        repository,
        environment: configEnvironment
      });

      const keysToRemove = existingVariables.map((variable) => variable.key).filter((secret) => secret in secretMap);

      if (keysToRemove.length > 0) {
        await deleteVariables({
          email,
          apiToken,
          workspace,
          repository,
          environment: configEnvironment,
          keys: keysToRemove
        });
      }
    } catch (error) {
      throw new SecretSyncError({ error });
    }
  },

  getSecrets: async (secretSync: TBitbucketSyncWithCredentials) => {
    const {
      connection,
      destinationConfig: { workspace, repository, environment }
    } = secretSync;

    const { email, apiToken } = connection.credentials;

    try {
      const variables = await listVariables({
        email,
        apiToken,
        workspace,
        repository,
        environment
      });

      const secretMap: TSecretMap = {};
      variables.forEach((variable) => {
        secretMap[variable.key] = {
          value: variable.secured ? "[SECURED]" : variable.value || "",
          comment: ""
        };
      });

      return secretMap;
    } catch (error) {
      throw new SecretSyncError({ error });
    }
  }
};
