/* eslint-disable no-await-in-loop */
import { request } from "@app/lib/config/request";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { GitLabConnectionMethod, refreshGitLabToken, TGitLabConnection } from "@app/services/app-connection/gitlab";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TGitLabSyncWithCredentials, TGitLabVariable } from "@app/services/secret-sync/gitlab/gitlab-sync-types";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import { SECRET_SYNC_NAME_MAP } from "../secret-sync-maps";

interface TGitLabVariablePayload {
  key?: string;
  value: string;
  variable_type?: "env_var" | "file";
  environment_scope?: string;
  protected?: boolean;
  masked?: boolean;
  masked_and_hidden?: boolean;
  description?: string;
}

interface TGitLabVariableCreate extends TGitLabVariablePayload {
  key: string;
}

interface TGitLabVariableUpdate extends Omit<TGitLabVariablePayload, "key"> {}

type TGitLabSyncFactoryDeps = {
  appConnectionDAL: Pick<TAppConnectionDALFactory, "updateById">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

const getValidAccessToken = async (
  connection: TGitLabConnection,
  appConnectionDAL: Pick<TAppConnectionDALFactory, "updateById">,
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">
): Promise<string> => {
  if (
    connection.method === GitLabConnectionMethod.OAuth &&
    connection.credentials.refreshToken &&
    connection.credentials.expiresAt < new Date()
  ) {
    const accessToken = await refreshGitLabToken(
      connection.credentials.refreshToken,
      connection.id,
      connection.orgId,
      appConnectionDAL,
      kmsService
    );
    return accessToken;
  }
  return connection.credentials.accessToken;
};

const getGitLabApiUrl = async (connection: TGitLabConnection): Promise<string> => {
  const baseUrl = connection.credentials.instanceUrl || IntegrationUrls.GITLAB_API_URL;
  await blockLocalAndPrivateIpAddresses(baseUrl);
  return baseUrl.includes("/api") ? baseUrl : `${baseUrl}/api`;
};

const buildVariablesEndpoint = (apiUrl: string, projectId: string): string => {
  return `${apiUrl}/v4/projects/${encodeURIComponent(projectId)}/variables`;
};

const getGitLabVariables = async ({
  accessToken,
  connection,
  projectId,
  targetEnvironment
}: {
  accessToken: string;
  connection: TGitLabConnection;
  projectId: string;
  targetEnvironment?: string;
}): Promise<TGitLabVariable[]> => {
  try {
    const apiUrl = await getGitLabApiUrl(connection);
    const baseEndpoint = buildVariablesEndpoint(apiUrl, projectId);

    const headers = {
      Authorization: `Bearer ${accessToken}`,
      "Accept-Encoding": "application/json",
      "Content-Type": "application/json"
    };

    let allVariables: TGitLabVariable[] = [];
    let url: string | null = `${baseEndpoint}?per_page=100`;

    if (targetEnvironment) {
      url += `&filter[environment_scope]=${encodeURIComponent(targetEnvironment)}`;
    }

    while (url) {
      const response = await request.get<TGitLabVariable[]>(url, { headers });
      allVariables = [...allVariables, ...(response.data || [])];

      const linkHeader = response.headers.link as string;
      const nextLink = linkHeader?.split(",").find((part: string) => part.includes('rel="next"'));

      if (nextLink) {
        url = nextLink.trim().split(";")[0].slice(1, -1);
      } else {
        url = null;
      }
    }

    if (targetEnvironment) {
      return allVariables.filter((variable) => variable.environment_scope === targetEnvironment);
    }

    return allVariables;
  } catch (error) {
    throw new SecretSyncError({
      error,
      secretKey: "list_variables"
    });
  }
};

const createGitLabVariable = async ({
  accessToken,
  connection,
  projectId,
  variable
}: {
  accessToken: string;
  connection: TGitLabConnection;
  projectId: string;
  variable: TGitLabVariableCreate;
}): Promise<void> => {
  try {
    const apiUrl = await getGitLabApiUrl(connection);
    const endpoint = buildVariablesEndpoint(apiUrl, projectId);

    const payload = {
      key: variable.key,
      value: variable.value,
      variable_type: variable.variable_type || "env_var",
      environment_scope: variable.environment_scope || "*",
      protected: variable.protected || false,
      masked: variable.masked || false,
      masked_and_hidden: variable.masked_and_hidden || false,
      raw: false,
      ...(variable.description && { description: variable.description })
    };

    await request.post(endpoint, payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Accept-Encoding": "application/json",
        "Content-Type": "application/json"
      }
    });
  } catch (error) {
    throw new SecretSyncError({
      error,
      secretKey: variable.key
    });
  }
};

const updateGitLabVariable = async ({
  accessToken,
  connection,
  projectId,
  key,
  variable,
  targetEnvironment
}: {
  accessToken: string;
  connection: TGitLabConnection;
  projectId: string;
  key: string;
  variable: TGitLabVariableUpdate;
  targetEnvironment?: string;
}): Promise<void> => {
  try {
    const apiUrl = await getGitLabApiUrl(connection);
    const baseEndpoint = buildVariablesEndpoint(apiUrl, projectId);
    let url = `${baseEndpoint}/${encodeURIComponent(key)}`;

    if (targetEnvironment) {
      url += `?filter[environment_scope]=${encodeURIComponent(targetEnvironment)}`;
    }

    const payload = {
      value: variable.value,
      ...(variable.variable_type && { variable_type: variable.variable_type }),
      ...(variable.environment_scope && { environment_scope: variable.environment_scope }),
      ...(variable.protected !== undefined && { protected: variable.protected }),
      ...(variable.masked !== undefined && { masked: variable.masked }),
      ...(variable.masked_and_hidden !== undefined && { masked_and_hidden: variable.masked_and_hidden }),
      ...(variable.description !== undefined && { description: variable.description || "" })
    };

    await request.put(url, payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Accept-Encoding": "application/json",
        "Content-Type": "application/json"
      }
    });
  } catch (error) {
    throw new SecretSyncError({
      error,
      secretKey: key
    });
  }
};

const deleteGitLabVariable = async ({
  accessToken,
  connection,
  projectId,
  key,
  targetEnvironment
}: {
  accessToken: string;
  connection: TGitLabConnection;
  projectId: string;
  key: string;
  targetEnvironment?: string;
}): Promise<void> => {
  try {
    const apiUrl = await getGitLabApiUrl(connection);
    const baseEndpoint = buildVariablesEndpoint(apiUrl, projectId);
    let url = `${baseEndpoint}/${encodeURIComponent(key)}`;

    if (targetEnvironment) {
      url += `?filter[environment_scope]=${encodeURIComponent(targetEnvironment)}`;
    }

    await request.delete(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Accept-Encoding": "application/json",
        "Content-Type": "application/json"
      }
    });
  } catch (error: unknown) {
    throw new SecretSyncError({
      error
    });
  }
};

export const GitLabSyncFns = {
  syncSecrets: async (
    secretSync: TGitLabSyncWithCredentials,
    secretMap: TSecretMap,
    { appConnectionDAL, kmsService }: TGitLabSyncFactoryDeps
  ): Promise<void> => {
    const { connection, environment, destinationConfig } = secretSync;

    const { projectId, targetEnvironment } = destinationConfig;

    const accessToken = await getValidAccessToken(connection, appConnectionDAL, kmsService);

    try {
      const currentVariables = await getGitLabVariables({
        accessToken,
        connection,
        projectId,
        targetEnvironment
      });

      const currentVariableMap = new Map(currentVariables.map((v) => [v.key, v]));

      for (const [key, { value }] of Object.entries(secretMap)) {
        try {
          const existingVariable = currentVariableMap.get(key);

          if (existingVariable) {
            if (existingVariable.value !== value) {
              await updateGitLabVariable({
                accessToken,
                connection,
                projectId,
                key,
                variable: {
                  value,
                  variable_type: existingVariable.variable_type,
                  environment_scope: targetEnvironment || existingVariable.environment_scope,
                  protected: destinationConfig.shouldProtectSecrets ?? existingVariable.protected,
                  ...(!existingVariable.masked && destinationConfig.shouldMaskSecrets && { masked: value?.length > 8 }),
                  ...(!existingVariable.hidden &&
                    destinationConfig.shouldHideSecrets && { masked_and_hidden: value?.length > 8 }),
                  description: existingVariable.description ?? undefined
                },
                targetEnvironment
              });
            }
          } else {
            await createGitLabVariable({
              accessToken,
              connection,
              projectId,
              variable: {
                key,
                value,
                variable_type: "env_var",
                environment_scope: targetEnvironment || "*",
                protected: destinationConfig.shouldProtectSecrets || false,
                masked: value?.length > 8 ? destinationConfig.shouldMaskSecrets || false : false,
                masked_and_hidden: value?.length > 8 ? destinationConfig.shouldHideSecrets || false : false
              }
            });
          }
        } catch (error) {
          throw new SecretSyncError({
            error,
            secretKey: key
          });
        }
      }

      if (!secretSync.syncOptions.disableSecretDeletion) {
        for (const variable of currentVariables) {
          try {
            const shouldDelete =
              matchesSchema(variable.key, environment?.slug || "", secretSync.syncOptions.keySchema) &&
              !(variable.key in secretMap);

            if (shouldDelete) {
              await deleteGitLabVariable({
                accessToken,
                connection,
                projectId,
                key: variable.key,
                targetEnvironment
              });
            }
          } catch (error) {
            throw new SecretSyncError({
              error,
              secretKey: variable.key
            });
          }
        }
      }
    } catch (error) {
      if (error instanceof SecretSyncError) {
        throw error;
      }
      throw new SecretSyncError({
        message: "Failed to sync secrets",
        error
      });
    }
  },

  removeSecrets: async (
    secretSync: TGitLabSyncWithCredentials,
    secretMap: TSecretMap,
    { appConnectionDAL, kmsService }: TGitLabSyncFactoryDeps
  ): Promise<void> => {
    const { connection, destinationConfig } = secretSync;

    const { projectId, targetEnvironment } = destinationConfig;

    const accessToken = await getValidAccessToken(connection, appConnectionDAL, kmsService);

    for (const key of Object.keys(secretMap)) {
      try {
        await deleteGitLabVariable({
          accessToken,
          connection,
          projectId,
          key,
          targetEnvironment
        });
      } catch (error) {
        throw new SecretSyncError({
          error,
          secretKey: key
        });
      }
    }
  },

  getSecrets: async (secretSync: TGitLabSyncWithCredentials): Promise<TSecretMap> => {
    throw new Error(`${SECRET_SYNC_NAME_MAP[secretSync.destination]} does not support importing secrets.`);
  }
};
