import { request } from "@app/lib/config/request";
import { removeTrailingSlash } from "@app/lib/fn";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import { TConvexEnvVarChange, TConvexListEnvVarsResponse, TConvexSyncWithCredentials } from "./convex-sync-types";

const getNormalizedDeploymentUrl = async (deploymentUrl: string) => {
  const normalized = removeTrailingSlash(deploymentUrl);
  await blockLocalAndPrivateIpAddresses(normalized);
  return normalized;
};

const listConvexEnvVars = async (deploymentUrl: string, adminKey: string) => {
  const normalized = await getNormalizedDeploymentUrl(deploymentUrl);
  const { data } = await request.get<TConvexListEnvVarsResponse>(
    `${normalized}/api/v1/list_environment_variables`,
    {
      headers: {
        Authorization: `Convex ${adminKey}`,
        Accept: "application/json"
      }
    }
  );

  return data.environmentVariables;
};

const updateConvexEnvVars = async (deploymentUrl: string, adminKey: string, changes: TConvexEnvVarChange[]) => {
  if (changes.length === 0) return;

  const normalized = await getNormalizedDeploymentUrl(deploymentUrl);
  await request.post<void>(
    `${normalized}/api/v1/update_environment_variables`,
    { changes },
    {
      headers: {
        Authorization: `Convex ${adminKey}`,
        "Content-Type": "application/json"
      }
    }
  );
};

export const ConvexSyncFns = {
  syncSecrets: async (secretSync: TConvexSyncWithCredentials, secretMap: TSecretMap) => {
    const {
      destinationConfig: { deploymentUrl },
      connection: {
        credentials: { adminKey }
      },
      environment,
      syncOptions: { disableSecretDeletion, keySchema }
    } = secretSync;

    const existing = await listConvexEnvVars(deploymentUrl, adminKey);

    const changes: TConvexEnvVarChange[] = Object.keys(secretMap).map((key) => ({
      name: key,
      value: secretMap[key].value ?? ""
    }));

    if (!disableSecretDeletion) {
      for (const key of Object.keys(existing)) {
        if (matchesSchema(key, environment?.slug || "", keySchema) && !secretMap[key]) {
          changes.push({
            name: key,
            value: null
          });
        }
      }
    }

    if (changes.length === 0) return;

    try {
      await updateConvexEnvVars(deploymentUrl, adminKey, changes);
    } catch (error) {
      throw new SecretSyncError({
        error,
        secretKey: changes[0]?.name
      });
    }
  },

  removeSecrets: async (secretSync: TConvexSyncWithCredentials, secretMap: TSecretMap) => {
    const {
      destinationConfig: { deploymentUrl },
      connection: {
        credentials: { adminKey }
      }
    } = secretSync;

    const existing = await listConvexEnvVars(deploymentUrl, adminKey);

    const changes: TConvexEnvVarChange[] = Object.keys(secretMap)
      .filter((key) => key in existing)
      .map((key) => ({
        name: key,
        value: null
      }));

    if (changes.length === 0) return;

    try {
      await updateConvexEnvVars(deploymentUrl, adminKey, changes);
    } catch (error) {
      throw new SecretSyncError({
        error,
        secretKey: changes[0]?.name
      });
    }
  },

  getSecrets: async (secretSync: TConvexSyncWithCredentials): Promise<TSecretMap> => {
    const {
      destinationConfig: { deploymentUrl },
      connection: {
        credentials: { adminKey }
      }
    } = secretSync;

    const envVars = await listConvexEnvVars(deploymentUrl, adminKey);

    return Object.fromEntries(Object.entries(envVars).map(([key, value]) => [key, { value }]));
  }
};
