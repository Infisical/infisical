import { request } from "@app/lib/config/request";
import { removeTrailingSlash } from "@app/lib/fn";
import {
  getQoveryAuthHeaders,
  paginatedQoveryRequest,
  QOVERY_DEFAULT_API_URL
} from "@app/services/app-connection/qovery";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { SECRET_SYNC_NAME_MAP } from "@app/services/secret-sync/secret-sync-maps";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import { QoverySyncScope, QoveryVariableType } from "./qovery-sync-enums";
import { TQoveryApiVariable, TQoverySyncWithCredentials } from "./qovery-sync-types";

// The scope path segment is the enum value itself ("project" / "environment"); this map only carries
// the scope value Qovery reports back, used to identify the entries we manage.
const QOVERY_API_SCOPE: Record<QoverySyncScope, string> = {
  [QoverySyncScope.Project]: "PROJECT",
  [QoverySyncScope.Environment]: "ENVIRONMENT"
};

const QOVERY_VARIABLE_TYPE_PATH_SEGMENT: Record<QoveryVariableType, string> = {
  [QoveryVariableType.Secret]: "secret",
  [QoveryVariableType.Variable]: "environmentVariable"
};

// Qovery returns inherited, built-in, alias, and override entries alongside the ones defined at the
// requested level. We only manage entries defined at the matching scope with a plain value type so we
// never edit or delete anything Infisical did not create.
const QOVERY_MANAGED_VARIABLE_TYPE = "VALUE";

export type TQoverySyncTarget = {
  scope: QoverySyncScope;
  scopeId: string;
  variableType: QoveryVariableType;
};

// Project scope when no environment is selected; environment scope otherwise.
export const resolveQoverySyncTarget = (
  destinationConfig: TQoverySyncWithCredentials["destinationConfig"]
): TQoverySyncTarget => {
  const { environmentId, projectId, variableType } = destinationConfig;

  if (environmentId) {
    return { scope: QoverySyncScope.Environment, scopeId: environmentId, variableType };
  }

  return { scope: QoverySyncScope.Project, scopeId: projectId, variableType };
};

// Pure, verifiable URL construction: {instanceUrl}/{scope}/{scopeId}/{variableTypeSegment}[/{resourceId}].
// The host is the fixed QOVERY_DEFAULT_API_URL; the segments appended here are resource ids, not hosts.
export const getQoveryResourceUrl = ({
  instanceUrl,
  scope,
  scopeId,
  variableType,
  resourceId
}: TQoverySyncTarget & { instanceUrl: string; resourceId?: string }) => {
  const segments = [removeTrailingSlash(instanceUrl), scope, scopeId, QOVERY_VARIABLE_TYPE_PATH_SEGMENT[variableType]];
  if (resourceId) segments.push(resourceId);

  return segments.join("/");
};

const listManagedQoveryVariables = async (
  instanceUrl: string,
  accessToken: string,
  target: TQoverySyncTarget
): Promise<TQoveryApiVariable[]> => {
  const url = getQoveryResourceUrl({ instanceUrl, ...target });
  const variables = await paginatedQoveryRequest<TQoveryApiVariable>(url, accessToken);

  return variables.filter(
    (variable) =>
      variable.scope === QOVERY_API_SCOPE[target.scope] &&
      (!variable.variable_type || variable.variable_type === QOVERY_MANAGED_VARIABLE_TYPE)
  );
};

const createQoveryVariable = async (
  instanceUrl: string,
  accessToken: string,
  target: TQoverySyncTarget,
  key: string,
  value: string
) => {
  const url = getQoveryResourceUrl({ instanceUrl, ...target });
  await request.post(url, { key, value }, { headers: getQoveryAuthHeaders(accessToken) });
};

const updateQoveryVariable = async (
  instanceUrl: string,
  accessToken: string,
  target: TQoverySyncTarget,
  resourceId: string,
  key: string,
  value: string
) => {
  const url = getQoveryResourceUrl({ instanceUrl, ...target, resourceId });
  await request.put(url, { key, value }, { headers: getQoveryAuthHeaders(accessToken) });
};

const deleteQoveryVariable = async (
  instanceUrl: string,
  accessToken: string,
  target: TQoverySyncTarget,
  resourceId: string
) => {
  const url = getQoveryResourceUrl({ instanceUrl, ...target, resourceId });
  await request.delete(url, { headers: getQoveryAuthHeaders(accessToken) });
};

export const QoverySyncFns = {
  syncSecrets: async (secretSync: TQoverySyncWithCredentials, secretMap: TSecretMap) => {
    const { connection, destinationConfig, environment, syncOptions } = secretSync;
    const { accessToken } = connection.credentials;
    const instanceUrl = QOVERY_DEFAULT_API_URL;
    const target = resolveQoverySyncTarget(destinationConfig);

    const managedVariables = await listManagedQoveryVariables(instanceUrl, accessToken, target);
    const managedVariablesByKey = new Map(managedVariables.map((variable) => [variable.key, variable]));

    for await (const key of Object.keys(secretMap)) {
      const { value } = secretMap[key];

      try {
        const existingVariable = managedVariablesByKey.get(key);

        if (!existingVariable) {
          await createQoveryVariable(instanceUrl, accessToken, target, key, value);
          // eslint-disable-next-line no-continue
          continue;
        }

        // Secrets never return their value, so they cannot be diffed and are always overwritten.
        // Variables expose their value, so we skip the update when it is already up to date.
        const isSecretVariableType = target.variableType === QoveryVariableType.Secret;
        if (isSecretVariableType || existingVariable.value !== value) {
          await updateQoveryVariable(instanceUrl, accessToken, target, existingVariable.id, key, value);
        }
      } catch (error) {
        throw new SecretSyncError({ error, secretKey: key });
      }
    }

    if (syncOptions.disableSecretDeletion) return;

    for await (const variable of managedVariables) {
      if (!matchesSchema(variable.key, environment?.slug || "", syncOptions.keySchema))
        // eslint-disable-next-line no-continue
        continue;

      if (!secretMap[variable.key]) {
        try {
          await deleteQoveryVariable(instanceUrl, accessToken, target, variable.id);
        } catch (error) {
          throw new SecretSyncError({ error, secretKey: variable.key });
        }
      }
    }
  },

  getSecrets: async (secretSync: TQoverySyncWithCredentials): Promise<TSecretMap> => {
    throw new Error(`${SECRET_SYNC_NAME_MAP[secretSync.destination]} does not support importing secrets.`);
  },

  removeSecrets: async (secretSync: TQoverySyncWithCredentials, secretMap: TSecretMap) => {
    const { connection, destinationConfig } = secretSync;
    const { accessToken } = connection.credentials;
    const instanceUrl = QOVERY_DEFAULT_API_URL;
    const target = resolveQoverySyncTarget(destinationConfig);

    const managedVariables = await listManagedQoveryVariables(instanceUrl, accessToken, target);

    for await (const variable of managedVariables) {
      if (variable.key in secretMap) {
        try {
          await deleteQoveryVariable(instanceUrl, accessToken, target, variable.id);
        } catch (error) {
          throw new SecretSyncError({ error, secretKey: variable.key });
        }
      }
    }
  }
};
