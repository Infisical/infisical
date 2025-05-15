import { request } from "@app/lib/config/request";
import { getTeamCityInstanceUrl } from "@app/services/app-connection/teamcity";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";
import {
  TDeleteTeamCityVariable,
  TPostTeamCityVariable,
  TTeamCityListVariables,
  TTeamCityListVariablesResponse,
  TTeamCitySyncWithCredentials
} from "@app/services/secret-sync/teamcity/teamcity-sync-types";

// Note: Most variables won't be returned with a value due to them being a "password" type.
// TeamCity API returns empty string for password-type variables for security reasons.
const listTeamCityVariables = async ({ instanceUrl, accessToken, project, buildConfig }: TTeamCityListVariables) => {
  const { data } = await request.get<TTeamCityListVariablesResponse>(
    buildConfig
      ? `${instanceUrl}/app/rest/buildTypes/${encodeURIComponent(buildConfig)}/parameters`
      : `${instanceUrl}/app/rest/projects/id:${encodeURIComponent(project)}/parameters`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json"
      }
    }
  );

  // Filters for only non-inherited environment variables
  // Strips out "env." from map key, but the "name" field still has the original unaltered key.
  return Object.fromEntries(
    data.property
      .filter((variable) => !variable.inherited)
      .filter((variable) => variable.name.startsWith("env."))
      .map((variable) => [
        variable.name.substring(4),
        { ...variable, value: variable.value || "" } // Password values will be empty strings from the API for security
      ])
  );
};

// Create and update both use the same method
const updateTeamCityVariable = async ({
  instanceUrl,
  accessToken,
  project,
  buildConfig,
  key,
  value
}: TPostTeamCityVariable) => {
  return request.post(
    buildConfig
      ? `${instanceUrl}/app/rest/buildTypes/${encodeURIComponent(buildConfig)}/parameters`
      : `${instanceUrl}/app/rest/projects/id:${encodeURIComponent(project)}/parameters`,
    {
      name: key,
      value,
      type: {
        rawValue: "password display='hidden'"
      }
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      }
    }
  );
};

const deleteTeamCityVariable = async ({
  instanceUrl,
  accessToken,
  project,
  buildConfig,
  key
}: TDeleteTeamCityVariable) => {
  return request.delete(
    buildConfig
      ? `${instanceUrl}/app/rest/buildTypes/${encodeURIComponent(buildConfig)}/parameters/${encodeURIComponent(key)}`
      : `${instanceUrl}/app/rest/projects/id:${encodeURIComponent(project)}/parameters/${encodeURIComponent(key)}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  );
};

export const TeamCitySyncFns = {
  syncSecrets: async (secretSync: TTeamCitySyncWithCredentials, secretMap: TSecretMap) => {
    const {
      connection,
      destinationConfig: { project, buildConfig }
    } = secretSync;

    const instanceUrl = await getTeamCityInstanceUrl(connection);
    const { accessToken } = connection.credentials;

    for await (const entry of Object.entries(secretMap)) {
      const [key, { value }] = entry;

      const payload = {
        instanceUrl,
        accessToken,
        project,
        buildConfig,
        key: `env.${key}`,
        value
      };

      try {
        // Replace every secret since TeamCity does not return secret values that we can cross-check
        // No need to differenciate create / update because TeamCity uses the same method for both
        await updateTeamCityVariable(payload);
      } catch (error) {
        throw new SecretSyncError({
          error,
          secretKey: key
        });
      }
    }

    if (secretSync.syncOptions.disableSecretDeletion) return;

    const variables = await listTeamCityVariables({ instanceUrl, accessToken, project, buildConfig });

    for await (const [key, variable] of Object.entries(variables)) {
      // eslint-disable-next-line no-continue
      if (!matchesSchema(key, secretSync.syncOptions.keySchema)) continue;

      if (!(key in secretMap)) {
        try {
          await deleteTeamCityVariable({
            key: variable.name, // We use variable.name instead of key because key is stripped of "env." prefix in listTeamCityVariables().
            instanceUrl,
            accessToken,
            project,
            buildConfig
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
  removeSecrets: async (secretSync: TTeamCitySyncWithCredentials, secretMap: TSecretMap) => {
    const {
      connection,
      destinationConfig: { project, buildConfig }
    } = secretSync;

    const instanceUrl = await getTeamCityInstanceUrl(connection);
    const { accessToken } = connection.credentials;

    const variables = await listTeamCityVariables({ instanceUrl, accessToken, project, buildConfig });

    for await (const [key, variable] of Object.entries(variables)) {
      if (key in secretMap) {
        try {
          await deleteTeamCityVariable({
            key: variable.name, // We use variable.name instead of key because key is stripped of "env." prefix in listTeamCityVariables().
            instanceUrl,
            accessToken,
            project,
            buildConfig
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
  getSecrets: async (secretSync: TTeamCitySyncWithCredentials) => {
    const {
      connection,
      destinationConfig: { project, buildConfig }
    } = secretSync;

    const instanceUrl = await getTeamCityInstanceUrl(connection);
    const { accessToken } = connection.credentials;

    return listTeamCityVariables({ instanceUrl, accessToken, project, buildConfig });
  }
};
