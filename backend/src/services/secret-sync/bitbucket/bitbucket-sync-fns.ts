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

const listBitbucketSecrets = async ({ email, apiToken, workspace, repository }: TBitbucketListVariables) => {
  const { data } = await request.get<{ values: TBitbucketVariable[] }>(
    `${IntegrationUrls.BITBUCKET_API_URL}/2.0/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(repository)}/pipelines_config/variables/`,
    {
      headers: {
        Authorization: `Basic ${Buffer.from(`${email}:${apiToken}`).toString("base64")}`,
        Accept: "application/json"
      }
    }
  );

  return data.values;
};

const listBitbucketEnvironmentSecrets = async ({
  email,
  apiToken,
  workspace,
  repository,
  environment
}: TBitbucketListVariables & { environment: string }) => {
  const { data } = await request.get<{ values: TBitbucketVariable[] }>(
    `${IntegrationUrls.BITBUCKET_API_URL}/2.0/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(repository)}/deployments_config/environments/${environment}/variables`,
    {
      headers: {
        Authorization: `Basic ${Buffer.from(`${email}:${apiToken}`).toString("base64")}`,
        Accept: "application/json"
      }
    }
  );

  return data.values;
};

// Helper function to upsert a single variable
const upsertBitbucketVariable = async ({
  email,
  apiToken,
  workspace,
  repository,
  key,
  value,
  existingVariables,
  isEnvironment = false,
  environment
}: {
  email: string;
  apiToken: string;
  workspace: string;
  repository: string;
  key: string;
  value: string;
  existingVariables: TBitbucketVariable[];
  isEnvironment?: boolean;
  environment?: string;
}) => {
  const existingVariable = existingVariables.find((variable) => variable.key === key);
  const auth = `Basic ${Buffer.from(`${email}:${apiToken}`).toString("base64")}`;

  if (existingVariable) {
    // Variable exists, use PUT to update it
    const baseUrl = `${IntegrationUrls.BITBUCKET_API_URL}/2.0/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(repository)}`;
    const url = isEnvironment
      ? `${baseUrl}/deployments_config/environments/${environment}/variables/${existingVariable.uuid}`
      : `${baseUrl}/pipelines_config/variables/${existingVariable.uuid}`;

    return request.put(
      url,
      {
        key,
        value,
        secured: true
      },
      {
        headers: {
          Authorization: auth,
          "Content-Type": "application/json"
        }
      }
    );
  }

  const baseUrl = `${IntegrationUrls.BITBUCKET_API_URL}/2.0/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(repository)}`;
  const url = isEnvironment
    ? `${baseUrl}/deployments_config/environments/${environment}/variables`
    : `${baseUrl}/pipelines_config/variables/`;

  return request.post(
    url,
    {
      key,
      value,
      secured: true
    },
    {
      headers: {
        Authorization: auth,
        "Content-Type": "application/json"
      }
    }
  );
};

const putBitbucketSecrets = async ({
  email,
  apiToken,
  workspace,
  repository,
  secretMap
}: TPutBitbucketVariable & { secretMap: TSecretMap }) => {
  // Get existing variables first
  const existingVariables = await listBitbucketSecrets({ email, apiToken, workspace, repository });

  const promises = Object.entries(secretMap).map(([key, { value }]) => {
    return upsertBitbucketVariable({
      email,
      apiToken,
      workspace,
      repository,
      key,
      value,
      existingVariables,
      isEnvironment: false
    });
  });

  return Promise.all(promises);
};

const putBitbucketEnvironmentSecrets = async ({
  email,
  apiToken,
  workspace,
  repository,
  environment,
  secretMap
}: TPutBitbucketVariable & { environment: string; secretMap: TSecretMap }) => {
  // Get existing variables first
  const existingVariables = await listBitbucketEnvironmentSecrets({
    email,
    apiToken,
    workspace,
    repository,
    environment
  });

  const promises = Object.entries(secretMap).map(([key, { value }]) => {
    return upsertBitbucketVariable({
      email,
      apiToken,
      workspace,
      repository,
      key,
      value,
      existingVariables,
      isEnvironment: true,
      environment
    });
  });

  return Promise.all(promises);
};

const deleteBitbucketSecrets = async ({ email, apiToken, workspace, repository, keys }: TDeleteBitbucketVariable) => {
  // First, we need to get the variable UUIDs since Bitbucket requires UUIDs for deletion
  const existingVariables = await listBitbucketSecrets({ email, apiToken, workspace, repository });
  const variablesToDelete = existingVariables.filter((variable) => keys.includes(variable.key));

  const promises = variablesToDelete.map((variable) => {
    return request.delete(
      `${IntegrationUrls.BITBUCKET_API_URL}/2.0/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(repository)}/pipelines_config/variables/${variable.uuid}`,
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`${email}:${apiToken}`).toString("base64")}`
        }
      }
    );
  });

  return Promise.all(promises);
};

const deleteBitbucketEnvironmentSecrets = async ({
  email,
  apiToken,
  workspace,
  repository,
  environment,
  keys
}: TDeleteBitbucketVariable & { environment: string }) => {
  // Get the variable UUIDs since Bitbucket requires UUIDs for deletion
  const existingVariables = await listBitbucketEnvironmentSecrets({
    email,
    apiToken,
    workspace,
    repository,
    environment
  });
  const variablesToDelete = existingVariables.filter((variable) => keys.includes(variable.key));

  const promises = variablesToDelete.map((variable) => {
    return request.delete(
      `${IntegrationUrls.BITBUCKET_API_URL}/2.0/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(repository)}/deployments_config/environments/${environment}/variables/${variable.uuid}`,
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`${email}:${apiToken}`).toString("base64")}`
        }
      }
    );
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
      // If environment is specified in destinationConfig, use environment variables
      if (configEnvironment) {
        await putBitbucketEnvironmentSecrets({
          email,
          apiToken,
          workspace,
          repository,
          environment: configEnvironment,
          secretMap
        });
      } else {
        // Otherwise, use repository variables (original behavior)
        await putBitbucketSecrets({ email, apiToken, workspace, repository, secretMap });
      }
    } catch (error) {
      throw new SecretSyncError({
        error
      });
    }

    if (secretSync.syncOptions.disableSecretDeletion) return;

    // Get existing secrets based on whether we're using environment or repository variables
    const existingVariables = configEnvironment
      ? await listBitbucketEnvironmentSecrets({
          email,
          apiToken,
          workspace,
          repository,
          environment: configEnvironment
        })
      : await listBitbucketSecrets({ email, apiToken, workspace, repository });

    const keys = existingVariables
      .map((variable) => variable.key)
      .filter(
        (secret) =>
          matchesSchema(secret, environment?.slug || "", secretSync.syncOptions.keySchema) && !(secret in secretMap)
      );

    if (keys.length > 0) {
      try {
        if (configEnvironment) {
          await deleteBitbucketEnvironmentSecrets({
            email,
            apiToken,
            workspace,
            repository,
            environment: configEnvironment,
            keys
          });
        } else {
          await deleteBitbucketSecrets({ email, apiToken, workspace, repository, keys });
        }
      } catch (error) {
        throw new SecretSyncError({
          error
        });
      }
    }
  },
  removeSecrets: async (secretSync: TBitbucketSyncWithCredentials, secretMap: TSecretMap) => {
    const {
      connection,
      destinationConfig: { workspace, repository, environment: configEnvironment }
    } = secretSync;

    const { email, apiToken } = connection.credentials;

    const existingVariables = configEnvironment
      ? await listBitbucketEnvironmentSecrets({
          email,
          apiToken,
          workspace,
          repository,
          environment: configEnvironment
        })
      : await listBitbucketSecrets({ email, apiToken, workspace, repository });

    const keys = existingVariables.map((variable) => variable.key).filter((secret) => secret in secretMap);

    if (keys.length > 0) {
      try {
        if (configEnvironment) {
          await deleteBitbucketEnvironmentSecrets({
            email,
            apiToken,
            workspace,
            repository,
            environment: configEnvironment,
            keys
          });
        } else {
          await deleteBitbucketSecrets({ email, apiToken, workspace, repository, keys });
        }
      } catch (error) {
        throw new SecretSyncError({
          error
        });
      }
    }
  },
  getSecrets: async (secretSync: TBitbucketSyncWithCredentials) => {
    const {
      connection,
      destinationConfig: { workspace, repository, environment }
    } = secretSync;

    const { email, apiToken } = connection.credentials;

    try {
      let url: string;

      if (environment) {
        url = `${IntegrationUrls.BITBUCKET_API_URL}/2.0/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(repository)}/deployments_config/environments/${environment}/variables`;
      } else {
        url = `${IntegrationUrls.BITBUCKET_API_URL}/2.0/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(repository)}/pipelines_config/variables/`;
      }

      const { data } = await request.get<{ values: TBitbucketVariable[] }>(url, {
        headers: {
          Authorization: `Basic ${Buffer.from(`${email}:${apiToken}`).toString("base64")}`,
          Accept: "application/json"
        }
      });

      const secretMap: TSecretMap = {};
      data.values.forEach((variable) => {
        secretMap[variable.key] = {
          value: variable.secured ? "[SECURED]" : variable.value || "",
          comment: ""
        };
      });

      return secretMap;
    } catch (error) {
      throw new SecretSyncError({
        error
      });
    }
  }
};
