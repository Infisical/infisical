/* eslint-disable no-await-in-loop */
import { AxiosResponse } from "axios";

import { request } from "@app/lib/config/request";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import { SECRET_SYNC_NAME_MAP } from "../secret-sync-maps";
import { TerraformCloudSyncScope } from "./terraform-cloud-sync-enums";
import {
  TerraformCloudApiResponse,
  TerraformCloudApiVariable,
  TerraformCloudVariable,
  TTerraformCloudSyncWithCredentials
} from "./terraform-cloud-sync-types";

const getTerraformCloudVariables = async (
  secretSync: TTerraformCloudSyncWithCredentials
): Promise<TerraformCloudVariable[]> => {
  const {
    destinationConfig,
    connection: {
      credentials: { apiToken }
    }
  } = secretSync;

  let url: string;
  let source: TerraformCloudVariable["source"];

  if (destinationConfig.scope === TerraformCloudSyncScope.VariableSet) {
    url = `${IntegrationUrls.TERRAFORM_CLOUD_API_URL}/api/v2/varsets/${destinationConfig.variableSetId}/relationships/vars`;
    source = "varset";
  } else {
    url = `${IntegrationUrls.TERRAFORM_CLOUD_API_URL}/api/v2/workspaces/${destinationConfig.workspaceId}/vars`;
    source = "workspace";
  }

  const headers = {
    Authorization: `Bearer ${apiToken}`,
    "Content-Type": "application/vnd.api+json"
  };

  const fetchAllPages = async (): Promise<TerraformCloudApiVariable[]> => {
    let results: TerraformCloudApiVariable[] = [];
    let nextUrl: string | null = url;

    while (nextUrl) {
      const res: AxiosResponse<TerraformCloudApiResponse<TerraformCloudApiVariable[]>> = await request.get<
        TerraformCloudApiResponse<TerraformCloudApiVariable[]>
      >(nextUrl, {
        headers
      });

      if (res.data?.data) {
        results = results.concat(res.data.data);
      }

      nextUrl = res.data?.links?.next ?? null;
    }

    return results;
  };

  const allVariableData = await fetchAllPages();

  const variables: TerraformCloudVariable[] = allVariableData.map((variable) => ({
    id: variable.id,
    key: variable.attributes.key,
    value: variable.attributes.value || "",
    sensitive: variable.attributes.sensitive,
    description: variable.attributes.description || "",
    category: variable.attributes.category,
    source
  }));

  return variables;
};

const deleteVariable = async (
  secretSync: TTerraformCloudSyncWithCredentials,
  variable: TerraformCloudVariable
): Promise<void> => {
  const {
    destinationConfig,
    connection: {
      credentials: { apiToken }
    }
  } = secretSync;

  try {
    let url;

    if (destinationConfig.scope === TerraformCloudSyncScope.VariableSet) {
      url = `${IntegrationUrls.TERRAFORM_CLOUD_API_URL}/api/v2/varsets/${destinationConfig.variableSetId}/relationships/vars/${variable.id}`;
    } else {
      url = `${IntegrationUrls.TERRAFORM_CLOUD_API_URL}/api/v2/workspaces/${destinationConfig.workspaceId}/vars/${variable.id}`;
    }

    await request.delete(url, {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/vnd.api+json"
      }
    });
  } catch (error) {
    throw new SecretSyncError({
      error,
      secretKey: variable.key
    });
  }
};

const createVariable = async (
  secretSync: TTerraformCloudSyncWithCredentials,
  secretMap: TSecretMap,
  key: string
): Promise<void> => {
  try {
    const {
      destinationConfig,
      connection: {
        credentials: { apiToken }
      }
    } = secretSync;

    let url;

    if (destinationConfig.scope === TerraformCloudSyncScope.VariableSet) {
      url = `${IntegrationUrls.TERRAFORM_CLOUD_API_URL}/api/v2/varsets/${destinationConfig.variableSetId}/relationships/vars`;
    } else {
      url = `${IntegrationUrls.TERRAFORM_CLOUD_API_URL}/api/v2/workspaces/${destinationConfig.workspaceId}/vars`;
    }

    await request.post(
      url,
      {
        data: {
          type: "vars",
          attributes: {
            key,
            value: secretMap[key].value,
            description: secretMap[key].comment || "",
            category: secretSync.destinationConfig.category,
            sensitive: true
          }
        }
      },
      {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/vnd.api+json"
        }
      }
    );
  } catch (error) {
    throw new SecretSyncError({
      error,
      secretKey: key
    });
  }
};

const updateVariable = async (
  secretSync: TTerraformCloudSyncWithCredentials,
  secretMap: TSecretMap,
  variable: TerraformCloudVariable
): Promise<void> => {
  try {
    const {
      destinationConfig,
      connection: {
        credentials: { apiToken }
      }
    } = secretSync;

    let url;

    if (destinationConfig.scope === TerraformCloudSyncScope.VariableSet) {
      url = `${IntegrationUrls.TERRAFORM_CLOUD_API_URL}/api/v2/varsets/${destinationConfig.variableSetId}/relationships/vars/${variable.id}`;
    } else {
      url = `${IntegrationUrls.TERRAFORM_CLOUD_API_URL}/api/v2/workspaces/${destinationConfig.workspaceId}/vars/${variable.id}`;
    }

    await request.patch(
      url,
      {
        data: {
          type: "vars",
          id: variable.id,
          attributes: {
            value: secretMap[variable.key].value,
            description: secretMap[variable.key].comment || "",
            category: secretSync.destinationConfig.category
          }
        }
      },
      {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/vnd.api+json"
        }
      }
    );
  } catch (error) {
    throw new SecretSyncError({
      error,
      secretKey: variable.key
    });
  }
};

export const TerraformCloudSyncFns = {
  syncSecrets: async (secretSync: TTerraformCloudSyncWithCredentials, secretMap: TSecretMap): Promise<void> => {
    const terraformCloudVariables = await getTerraformCloudVariables(secretSync);
    const terraformCloudVariablesMap = new Map<string, TerraformCloudVariable>(
      terraformCloudVariables.map((v) => [v.key, v])
    );

    const secretKeys = Object.keys(secretMap);
    for (const key of secretKeys) {
      const existingVariable = terraformCloudVariablesMap.get(key);

      if (!existingVariable) {
        await createVariable(secretSync, secretMap, key);
      } else {
        await updateVariable(secretSync, secretMap, existingVariable);
      }
    }

    if (secretSync.syncOptions.disableSecretDeletion) return;

    for (const terraformCloudVariable of terraformCloudVariables) {
      // eslint-disable-next-line no-continue
      if (!matchesSchema(terraformCloudVariable.key, secretSync.syncOptions.keySchema)) continue;

      if (!Object.prototype.hasOwnProperty.call(secretMap, terraformCloudVariable.key)) {
        await deleteVariable(secretSync, terraformCloudVariable);
      }
    }
  },

  getSecrets: async (secretSync: TTerraformCloudSyncWithCredentials): Promise<TSecretMap> => {
    throw new Error(`${SECRET_SYNC_NAME_MAP[secretSync.destination]} does not support importing secrets.`);
  },

  removeSecrets: async (secretSync: TTerraformCloudSyncWithCredentials, secretMap: TSecretMap): Promise<void> => {
    const terraformCloudVariables = await getTerraformCloudVariables(secretSync);

    for (const variable of terraformCloudVariables) {
      if (Object.prototype.hasOwnProperty.call(secretMap, variable.key)) {
        await deleteVariable(secretSync, variable);
      }
    }
  }
};
