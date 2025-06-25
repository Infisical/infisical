/* eslint-disable no-await-in-loop */
import { GitbeakerRequestError } from "@gitbeaker/rest";

import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import {
  getGitLabClient,
  GitLabConnectionMethod,
  refreshGitLabToken,
  TGitLabConnection
} from "@app/services/app-connection/gitlab";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TGitLabSyncWithCredentials, TGitLabVariable } from "@app/services/secret-sync/gitlab/gitlab-sync-types";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import { SECRET_SYNC_NAME_MAP } from "../secret-sync-maps";
import { GitLabSyncScope } from "./gitlab-sync-enums";

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
    new Date(connection.credentials.expiresAt) < new Date()
  ) {
    const accessToken = await refreshGitLabToken(
      connection.credentials.refreshToken,
      connection.id,
      connection.orgId,
      appConnectionDAL,
      kmsService,
      connection.credentials.instanceUrl
    );
    return accessToken;
  }
  return connection.credentials.accessToken;
};

const getGitLabVariables = async ({
  accessToken,
  connection,
  scope,
  resourceId,
  targetEnvironment
}: {
  accessToken: string;
  connection: TGitLabConnection;
  scope: GitLabSyncScope;
  resourceId: string;
  targetEnvironment?: string;
}): Promise<TGitLabVariable[]> => {
  try {
    const client = await getGitLabClient(
      accessToken,
      connection.credentials.instanceUrl,
      connection.method === GitLabConnectionMethod.OAuth
    );

    let variables: TGitLabVariable[] = [];

    if (scope === GitLabSyncScope.Project) {
      variables = await client.ProjectVariables.all(resourceId);
    } else {
      variables = await client.GroupVariables.all(resourceId);
    }

    if (targetEnvironment) {
      variables = variables.filter((v) => v.environmentScope === targetEnvironment);
    }

    return variables;
  } catch (error) {
    if (error instanceof GitbeakerRequestError) {
      throw new SecretSyncError({
        error: new Error(
          `Failed to fetch variables: ${error.message ?? "Unknown error"}${error.cause?.description && error.message !== "Unauthorized" ? `. Cause: ${error.cause.description}` : ""}`
        )
      });
    }
    throw new SecretSyncError({
      error
    });
  }
};

const createGitLabVariable = async ({
  accessToken,
  connection,
  scope,
  resourceId,
  variable
}: {
  accessToken: string;
  connection: TGitLabConnection;
  scope: GitLabSyncScope;
  resourceId: string;
  variable: TGitLabVariableCreate;
}): Promise<void> => {
  try {
    const client = await getGitLabClient(
      accessToken,
      connection.credentials.instanceUrl,
      connection.method === GitLabConnectionMethod.OAuth
    );

    const payload = {
      key: variable.key,
      value: variable.value,
      variableType: "env_var",
      environmentScope: variable.environment_scope || "*",
      protected: variable.protected || false,
      masked: variable.masked || false,
      masked_and_hidden: variable.masked_and_hidden || false,
      raw: false
    };

    if (scope === GitLabSyncScope.Project) {
      await client.ProjectVariables.create(resourceId, payload.key, payload.value, {
        variableType: "env_var",
        environmentScope: payload.environmentScope,
        protected: payload.protected,
        masked: payload.masked,
        masked_and_hidden: payload.masked_and_hidden,
        raw: false
      });
    } else {
      await client.GroupVariables.create(resourceId, payload.key, payload.value, {
        variableType: "env_var",
        environmentScope: payload.environmentScope,
        protected: payload.protected,
        masked: payload.masked,
        ...(payload.masked_and_hidden && { masked_and_hidden: payload.masked_and_hidden }),
        raw: false
      });
    }
  } catch (error) {
    if (error instanceof GitbeakerRequestError) {
      throw new SecretSyncError({
        error: new Error(
          `Failed to create variable: ${error.message ?? "Unknown error"}${error.cause?.description && error.message !== "Unauthorized" ? `. Cause: ${error.cause.description}` : ""}`
        ),
        secretKey: variable.key
      });
    }
    throw new SecretSyncError({
      error,
      secretKey: variable.key
    });
  }
};

const updateGitLabVariable = async ({
  accessToken,
  connection,
  scope,
  resourceId,
  key,
  variable,
  targetEnvironment
}: {
  accessToken: string;
  connection: TGitLabConnection;
  scope: GitLabSyncScope;
  resourceId: string;
  key: string;
  variable: TGitLabVariableUpdate;
  targetEnvironment?: string;
}): Promise<void> => {
  try {
    const client = await getGitLabClient(
      accessToken,
      connection.credentials.instanceUrl,
      connection.method === GitLabConnectionMethod.OAuth
    );

    const options = {
      ...(variable.environment_scope && { environmentScope: variable.environment_scope }),
      ...(variable.protected !== undefined && { protected: variable.protected }),
      ...(variable.masked !== undefined && { masked: variable.masked })
    };

    if (targetEnvironment) {
      options.environmentScope = targetEnvironment;
    }

    if (scope === GitLabSyncScope.Project) {
      await client.ProjectVariables.edit(resourceId, key, variable.value, {
        ...options,
        filter: { environment_scope: targetEnvironment || "*" }
      });
    } else {
      await client.GroupVariables.edit(resourceId, key, variable.value, {
        ...options,
        filter: { environment_scope: targetEnvironment || "*" }
      });
    }
  } catch (error) {
    if (error instanceof GitbeakerRequestError) {
      throw new SecretSyncError({
        error: new Error(
          `Failed to update variable: ${error.message ?? "Unknown error"}${error.cause?.description && error.message !== "Unauthorized" ? `. Cause: ${error.cause.description}` : ""}`
        ),
        secretKey: key
      });
    }
    throw new SecretSyncError({
      error,
      secretKey: key
    });
  }
};

const deleteGitLabVariable = async ({
  accessToken,
  connection,
  scope,
  resourceId,
  key,
  targetEnvironment,
  allVariables
}: {
  accessToken: string;
  connection: TGitLabConnection;
  scope: GitLabSyncScope;
  resourceId: string;
  key: string;
  targetEnvironment?: string;
  allVariables?: TGitLabVariable[];
}): Promise<void> => {
  if (allVariables && !allVariables.find((v) => v.key === key)) {
    return;
  }
  try {
    const client = await getGitLabClient(
      accessToken,
      connection.credentials.instanceUrl,
      connection.method === GitLabConnectionMethod.OAuth
    );

    const options: { filter?: { environment_scope: string } } = {};
    if (targetEnvironment) {
      options.filter = { environment_scope: targetEnvironment || "*" };
    }

    if (scope === GitLabSyncScope.Project) {
      await client.ProjectVariables.remove(resourceId, key, options);
    } else {
      await client.GroupVariables.remove(resourceId, key);
    }
  } catch (error: unknown) {
    if (error instanceof GitbeakerRequestError) {
      throw new SecretSyncError({
        error: new Error(
          `Failed to delete variable: ${error.message ?? "Unknown error"}${error.cause?.description && error.message !== "Unauthorized" ? `. Cause: ${error.cause.description}` : ""}`
        ),
        secretKey: key
      });
    }
    throw new SecretSyncError({
      error,
      secretKey: key
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
    const { scope, targetEnvironment } = destinationConfig;

    const resourceId = scope === GitLabSyncScope.Project ? destinationConfig.projectId : destinationConfig.groupId;

    const accessToken = await getValidAccessToken(connection, appConnectionDAL, kmsService);

    try {
      const currentVariables = await getGitLabVariables({
        accessToken,
        connection,
        scope,
        resourceId,
        targetEnvironment
      });

      const currentVariableMap = new Map(currentVariables.map((v) => [v.key, v]));

      for (const [key, { value }] of Object.entries(secretMap)) {
        if (value?.length < 8 && destinationConfig.shouldMaskSecrets) {
          throw new SecretSyncError({
            message: `Secret ${key} is too short to be masked. GitLab requires a minimum of 8 characters for masked secrets.`,
            secretKey: key
          });
        }
        try {
          const existingVariable = currentVariableMap.get(key);

          if (existingVariable) {
            if (
              existingVariable.value !== value ||
              existingVariable.environmentScope !== targetEnvironment ||
              existingVariable.protected !== destinationConfig.shouldProtectSecrets ||
              existingVariable.masked !== destinationConfig.shouldMaskSecrets
            ) {
              await updateGitLabVariable({
                accessToken,
                connection,
                scope,
                resourceId,
                key,
                variable: {
                  value,
                  environment_scope: targetEnvironment,
                  protected: destinationConfig.shouldProtectSecrets,
                  masked: destinationConfig.shouldMaskSecrets || existingVariable.hidden
                },
                targetEnvironment
              });
            }
          } else {
            await createGitLabVariable({
              accessToken,
              connection,
              scope,
              resourceId,
              variable: {
                key,
                value,
                variable_type: "env_var",
                environment_scope: targetEnvironment || "*",
                protected: destinationConfig.shouldProtectSecrets || false,
                masked: destinationConfig.shouldMaskSecrets || false,
                masked_and_hidden: destinationConfig.shouldHideSecrets || false
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
                scope,
                resourceId,
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
    const { scope, targetEnvironment } = destinationConfig;

    const resourceId = scope === GitLabSyncScope.Project ? destinationConfig.projectId : destinationConfig.groupId;

    const accessToken = await getValidAccessToken(connection, appConnectionDAL, kmsService);

    const allVariables = await getGitLabVariables({
      accessToken,
      connection,
      scope,
      resourceId,
      targetEnvironment
    });

    for (const key of Object.keys(secretMap)) {
      try {
        await deleteGitLabVariable({
          accessToken,
          connection,
          scope,
          resourceId,
          key,
          targetEnvironment,
          allVariables
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
