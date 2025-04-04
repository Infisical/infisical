/* eslint-disable no-await-in-loop */
import { request } from "@app/lib/config/request";
import { logger } from "@app/lib/logger";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
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

  let url;
  let source: TerraformCloudVariable["source"];

  if (destinationConfig.scope === TerraformCloudSyncScope.VariableSet) {
    url = `${IntegrationUrls.TERRAFORM_CLOUD_API_URL}/api/v2/varsets/${destinationConfig.destinationId}/relationships/vars`;
    source = "varset";
  } else {
    url = `${IntegrationUrls.TERRAFORM_CLOUD_API_URL}/api/v2/workspaces/${destinationConfig.destinationId}/vars`;
    source = "workspace";
  }

  const response = await request.get<TerraformCloudApiResponse<TerraformCloudApiVariable[]>>(url, {
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/vnd.api+json"
    }
  });

  if (!response.data || !response.data.data) {
    return [];
  }

  const variables: TerraformCloudVariable[] = response.data.data.map((variable: TerraformCloudApiVariable) => ({
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
      url = `${IntegrationUrls.TERRAFORM_CLOUD_API_URL}/api/v2/varsets/${destinationConfig.destinationId}/relationships/vars/${variable.id}`;
    } else {
      url = `${IntegrationUrls.TERRAFORM_CLOUD_API_URL}/api/v2/workspaces/${destinationConfig.destinationId}/vars/${variable.id}`;
    }

    await request.delete(url, {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/vnd.api+json"
      }
    });

    logger.info(`Deleted variable ${variable.key} from Terraform Cloud ${destinationConfig.scope}`);
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
      url = `${IntegrationUrls.TERRAFORM_CLOUD_API_URL}/api/v2/varsets/${destinationConfig.destinationId}/relationships/vars`;
    } else {
      url = `${IntegrationUrls.TERRAFORM_CLOUD_API_URL}/api/v2/workspaces/${destinationConfig.destinationId}/vars`;
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

    logger.info(`Created variable ${key} in Terraform Cloud ${destinationConfig.scope}`);
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
      url = `${IntegrationUrls.TERRAFORM_CLOUD_API_URL}/api/v2/varsets/${destinationConfig.destinationId}/relationships/vars/${variable.id}`;
    } else {
      url = `${IntegrationUrls.TERRAFORM_CLOUD_API_URL}/api/v2/workspaces/${destinationConfig.destinationId}/vars/${variable.id}`;
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

    logger.info(`Updated variable ${variable.key} in Terraform Cloud ${destinationConfig.scope}`);
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
