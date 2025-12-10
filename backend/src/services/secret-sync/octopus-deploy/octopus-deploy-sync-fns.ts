import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import { SECRET_SYNC_NAME_MAP } from "../secret-sync-maps";
import {
  TOctopusDeploySyncWithCredentials,
  TOctopusDeployVariable,
  TOctopusDeployVariableSet
} from "./octopus-deploy-sync-types";

export const OctopusDeploySyncFns = {
  getAuthHeader(apiKey: string): Record<string, string> {
    return {
      "X-NuGet-ApiKey": apiKey,
      "X-Octopus-ApiKey": apiKey,
      Accept: "application/json",
      "Content-Type": "application/json"
    };
  },

  buildVariableUrl(instanceUrl: string, spaceId: string, projectId: string, scope: string): string {
    switch (scope) {
      case "project":
        return `${instanceUrl}/api/${spaceId}/projects/${projectId}/variables`;
      default:
        throw new BadRequestError({
          message: `Unsupported Octopus Deploy scope: ${scope}`
        });
    }
  },

  async syncSecrets(secretSync: TOctopusDeploySyncWithCredentials, secretMap: TSecretMap) {
    const {
      connection,
      environment,
      syncOptions: { disableSecretDeletion, keySchema }
    } = secretSync;
    const { apiKey, instanceUrl } = connection.credentials;

    const { spaceId, projectId, scope } = secretSync.destinationConfig;

    const url = this.buildVariableUrl(instanceUrl, spaceId, projectId, scope);

    const { data: variableSet } = await request.get<TOctopusDeployVariableSet>(url, {
      headers: this.getAuthHeader(apiKey)
    });

    // Get scope values from destination config (if configured)
    const scopeValues = secretSync.destinationConfig.scopeValues || {};

    const nonSenstiveVariables: TOctopusDeployVariable[] = [];
    let sensitiveVariables: TOctopusDeployVariable[] = [];

    variableSet.Variables.forEach((variable) => {
      if (!variable.IsSensitive && variable.Type !== "Sensitive") {
        nonSenstiveVariables.push(variable);
      } else {
        // sensitve variables, this could contain infisical secrets
        sensitiveVariables.push(variable);
      }
    });

    // Build new variables array from secret map
    const newVariables: TOctopusDeployVariable[] = Object.entries(secretMap).map(([key, secret]) => ({
      Name: key,
      Value: secret.value,
      Description: secret.comment || "",
      Scope: {
        Environment: scopeValues.environments,
        Role: scopeValues.roles,
        Machine: scopeValues.machines,
        ProcessOwner: scopeValues.processes,
        Action: scopeValues.actions,
        Channel: scopeValues.channels
      },
      IsEditable: false,
      Prompt: null,
      Type: "Sensitive",
      IsSensitive: true
    }));

    const keysToDelete = new Set<string>();

    if (!disableSecretDeletion) {
      sensitiveVariables.forEach((variable) => {
        if (!matchesSchema(variable.Name, environment?.slug || "", keySchema)) return;

        if (!secretMap[variable.Name]) {
          keysToDelete.add(variable.Name);
        }
      });
    }

    sensitiveVariables = sensitiveVariables.filter((variable) => !keysToDelete.has(variable.Name));

    const newVariableKeys = newVariables.map((variable) => variable.Name);
    // Keep sensitive variables that are not in the new variables array, to avoid duplication
    sensitiveVariables = sensitiveVariables.filter((variable) => !newVariableKeys.includes(variable.Name));

    await request.put(
      url,
      {
        ...variableSet,
        Variables: [...nonSenstiveVariables, ...sensitiveVariables, ...newVariables]
      },
      {
        headers: this.getAuthHeader(apiKey)
      }
    );
  },
  async removeSecrets(secretSync: TOctopusDeploySyncWithCredentials, secretMap: TSecretMap) {
    const {
      credentials: { apiKey, instanceUrl }
    } = secretSync.connection;

    const { spaceId, projectId, scope } = secretSync.destinationConfig;

    const url = this.buildVariableUrl(instanceUrl, spaceId, projectId, scope);

    const { data: variableSet } = await request.get<TOctopusDeployVariableSet>(url, {
      headers: this.getAuthHeader(apiKey)
    });

    const infisicalSecretKeys = Object.keys(secretMap);

    const variablesToDelete = variableSet.Variables.filter(
      (variable) =>
        infisicalSecretKeys.includes(variable.Name) && variable.IsSensitive === true && variable.Type === "Sensitive"
    ).map((variable) => variable.Id);

    await request.put(
      url,
      {
        ...variableSet,
        Variables: variableSet.Variables.filter((variable) => !variablesToDelete.includes(variable.Id))
      },
      {
        headers: this.getAuthHeader(apiKey)
      }
    );
  },
  async getSecrets(secretSync: TOctopusDeploySyncWithCredentials): Promise<TSecretMap> {
    throw new Error(`${SECRET_SYNC_NAME_MAP[secretSync.destination]} does not support importing secrets.`);
  }
};
