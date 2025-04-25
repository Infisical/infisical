import { request } from "@app/lib/config/request";
import { getWindmillInstanceUrl } from "@app/services/app-connection/windmill";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import {
  TDeleteWindmillVariable,
  TPostWindmillVariable,
  TWindmillListVariables,
  TWindmillListVariablesResponse,
  TWindmillSyncWithCredentials,
  TWindmillVariable
} from "@app/services/secret-sync/windmill/windmill-sync-types";

import { TSecretMap } from "../secret-sync-types";

const PAGE_LIMIT = 100;

const listWindmillVariables = async ({ instanceUrl, workspace, accessToken, path }: TWindmillListVariables) => {
  const variables: Record<string, TWindmillVariable> = {};

  // windmill paginates but doesn't return if there's more pages so we need to check if page size full
  let page: number | null = 1;

  while (page) {
    // eslint-disable-next-line no-await-in-loop
    const { data: variablesPage } = await request.get<TWindmillListVariablesResponse>(
      `${instanceUrl}/api/w/${workspace}/variables/list`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        },
        params: {
          page,
          limit: PAGE_LIMIT,
          path_start: path
        }
      }
    );

    for (const variable of variablesPage) {
      const variableName = variable.path.replace(path, "");

      if (variable.is_secret) {
        // eslint-disable-next-line no-await-in-loop
        const { data: variableValue } = await request.get<string>(
          `${instanceUrl}/api/w/${workspace}/variables/get_value/${variable.path}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`
            }
          }
        );

        variables[variableName] = {
          ...variable,
          value: variableValue
        };
      } else {
        variables[variableName] = variable;
      }
    }

    if (variablesPage.length >= PAGE_LIMIT) {
      page += 1;
    } else {
      page = null;
    }
  }

  return variables;
};

const createWindmillVariable = async ({
  path,
  value,
  instanceUrl,
  accessToken,
  workspace,
  description
}: TPostWindmillVariable) =>
  request.post(
    `${instanceUrl}/api/w/${workspace}/variables/create`,
    {
      path,
      value,
      is_secret: true,
      description
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      }
    }
  );

const updateWindmillVariable = async ({
  path,
  value,
  instanceUrl,
  accessToken,
  workspace,
  description
}: TPostWindmillVariable) =>
  request.post(
    `${instanceUrl}/api/w/${workspace}/variables/update/${path}`,
    {
      value,
      is_secret: true,
      description
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      }
    }
  );

const deleteWindmillVariable = async ({ path, instanceUrl, accessToken, workspace }: TDeleteWindmillVariable) =>
  request.delete(`${instanceUrl}/api/w/${workspace}/variables/delete/${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

export const WindmillSyncFns = {
  syncSecrets: async (secretSync: TWindmillSyncWithCredentials, secretMap: TSecretMap) => {
    const {
      connection,
      destinationConfig: { path },
      syncOptions: { disableSecretDeletion }
    } = secretSync;

    // url needs to be lowercase
    const workspace = secretSync.destinationConfig.workspace.toLowerCase();

    const instanceUrl = await getWindmillInstanceUrl(connection);

    const { accessToken } = connection.credentials;

    const variables = await listWindmillVariables({ instanceUrl, accessToken, workspace, path });

    for await (const entry of Object.entries(secretMap)) {
      const [key, { value, comment = "" }] = entry;

      try {
        const payload = {
          instanceUrl,
          workspace,
          path: path + key,
          value,
          accessToken,
          description: comment
        };
        if (key in variables) {
          if (variables[key].value !== value || variables[key].description !== comment)
            await updateWindmillVariable(payload);
        } else {
          await createWindmillVariable(payload);
        }
      } catch (error) {
        throw new SecretSyncError({
          error,
          secretKey: key
        });
      }
    }

    if (disableSecretDeletion) return;

    for await (const [key, variable] of Object.entries(variables)) {
      if (!(key in secretMap)) {
        try {
          await deleteWindmillVariable({
            instanceUrl,
            workspace,
            path: variable.path,
            accessToken
          });
        } catch (error) {
          throw new SecretSyncError({
            error,
            secretKey: key
          });
        }
      }
    }
  },
  removeSecrets: async (secretSync: TWindmillSyncWithCredentials, secretMap: TSecretMap) => {
    const {
      connection,
      destinationConfig: { path }
    } = secretSync;

    // url needs to be lowercase
    const workspace = secretSync.destinationConfig.workspace.toLowerCase();

    const instanceUrl = await getWindmillInstanceUrl(connection);

    const { accessToken } = connection.credentials;

    const variables = await listWindmillVariables({ instanceUrl, accessToken, workspace, path });

    for await (const [key, variable] of Object.entries(variables)) {
      if (key in secretMap) {
        try {
          await deleteWindmillVariable({
            path: variable.path,
            instanceUrl,
            workspace,
            accessToken
          });
        } catch (error) {
          throw new SecretSyncError({
            error,
            secretKey: key
          });
        }
      }
    }
  },
  getSecrets: async (secretSync: TWindmillSyncWithCredentials) => {
    const {
      connection,
      destinationConfig: { path }
    } = secretSync;

    // url needs to be lowercase
    const workspace = secretSync.destinationConfig.workspace.toLowerCase();

    const instanceUrl = await getWindmillInstanceUrl(connection);

    const { accessToken } = connection.credentials;

    const variables = await listWindmillVariables({ instanceUrl, accessToken, workspace, path });

    return Object.fromEntries(
      Object.entries(variables).map(([key, variable]) => [key, { value: variable.value ?? "" }])
    );
  }
};
