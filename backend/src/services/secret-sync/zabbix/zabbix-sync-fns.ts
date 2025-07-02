import RE2 from "re2";

import { request } from "@app/lib/config/request";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";
import {
  TZabbixSecret,
  TZabbixSyncWithCredentials,
  ZabbixApiResponse,
  ZabbixMacroCreateResponse,
  ZabbixMacroDeleteResponse
} from "@app/services/secret-sync/zabbix/zabbix-sync-types";

import { ZabbixSyncScope } from "./zabbix-sync-enums";

const TRAILING_SLASH_REGEX = new RE2("/+$");
const MACRO_START_REGEX = new RE2("^\\{\\$");
const MACRO_END_REGEX = new RE2("\\}$");

const extractMacroKey = (macro: string): string => {
  return macro.replace(MACRO_START_REGEX, "").replace(MACRO_END_REGEX, "");
};

// Helper function to handle Zabbix API responses and errors
const handleZabbixResponse = <T>(response: ZabbixApiResponse<T>): T => {
  if (response.data.error) {
    const errorMessage = response.data.error.data
      ? `${response.data.error.message}: ${response.data.error.data}`
      : response.data.error.message;
    throw new SecretSyncError({
      error: new Error(`Zabbix API Error (${response.data.error.code}): ${errorMessage}`)
    });
  }

  if (response.data.result === undefined) {
    throw new SecretSyncError({
      error: new Error("Zabbix API returned no result")
    });
  }

  return response.data.result;
};

const listZabbixSecrets = async (apiToken: string, instanceUrl: string, hostId?: string): Promise<TZabbixSecret[]> => {
  const apiUrl = `${instanceUrl.replace(TRAILING_SLASH_REGEX, "")}/api_jsonrpc.php`;

  // - jsonrpc: Specifies the JSON-RPC protocol version.
  // - method: The API method to call, in this case "usermacro.get" for retrieving user macros.
  // - id: A unique identifier for the request. Required by JSON-RPC but not used by the API for logic. Typically set to any integer.
  const payload = {
    jsonrpc: "2.0" as const,
    method: "usermacro.get",
    params: hostId ? { output: "extend", hostids: hostId } : { output: "extend", globalmacro: true },
    id: 1
  };

  try {
    const response: ZabbixApiResponse<TZabbixSecret[]> = await request.post(apiUrl, payload, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiToken}`
      }
    });

    return handleZabbixResponse(response) || [];
  } catch (error) {
    throw new SecretSyncError({
      error: error instanceof Error ? error : new Error("Failed to list Zabbix secrets")
    });
  }
};

const putZabbixSecrets = async (
  apiToken: string,
  instanceUrl: string,
  secretMap: TSecretMap,
  destinationConfig: TZabbixSyncWithCredentials["destinationConfig"],
  existingSecrets: TZabbixSecret[]
): Promise<void> => {
  const apiUrl = `${instanceUrl.replace(TRAILING_SLASH_REGEX, "")}/api_jsonrpc.php`;
  const hostId = destinationConfig.scope === ZabbixSyncScope.Host ? destinationConfig.hostId : undefined;

  const existingMacroMap = new Map(existingSecrets.map((secret) => [secret.macro, secret]));

  for (const [key, secret] of Object.entries(secretMap)) {
    const macroKey = `{$${key.toUpperCase()}}`;
    const existingMacro = existingMacroMap.get(macroKey);

    try {
      if (existingMacro) {
        // Update existing macro
        const updatePayload = {
          jsonrpc: "2.0" as const,
          method: hostId ? "usermacro.update" : "usermacro.updateglobal",
          params: {
            [hostId ? "hostmacroid" : "globalmacroid"]: existingMacro[hostId ? "hostmacroid" : "globalmacroid"],
            value: secret.value,
            type: destinationConfig.macroType,
            description: secret.comment
          },
          id: 1
        };

        // eslint-disable-next-line no-await-in-loop
        const response: ZabbixApiResponse<ZabbixMacroCreateResponse> = await request.post(apiUrl, updatePayload, {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiToken}`
          }
        });

        handleZabbixResponse(response);
      } else {
        // Create new macro
        const createPayload = {
          jsonrpc: "2.0" as const,
          method: hostId ? "usermacro.create" : "usermacro.createglobal",
          params: hostId
            ? {
                hostid: hostId,
                macro: macroKey,
                value: secret.value,
                type: destinationConfig.macroType,
                description: secret.comment
              }
            : {
                macro: macroKey,
                value: secret.value,
                type: destinationConfig.macroType,
                description: secret.comment
              },
          id: 1
        };

        // eslint-disable-next-line no-await-in-loop
        const response: ZabbixApiResponse<ZabbixMacroCreateResponse> = await request.post(apiUrl, createPayload, {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiToken}`
          }
        });

        handleZabbixResponse(response);
      }
    } catch (error) {
      throw new SecretSyncError({
        error: error instanceof Error ? error : new Error(`Failed to sync secret ${key}`)
      });
    }
  }
};

const deleteZabbixSecrets = async (
  apiToken: string,
  instanceUrl: string,
  keys: string[],
  hostId?: string
): Promise<void> => {
  if (keys.length === 0) return;

  const apiUrl = `${instanceUrl.replace(TRAILING_SLASH_REGEX, "")}/api_jsonrpc.php`;

  try {
    // Get existing macros to find their IDs
    const existingSecrets = await listZabbixSecrets(apiToken, instanceUrl, hostId);
    const macroIds = existingSecrets
      .filter((secret) => keys.includes(secret.macro))
      .map((secret) => secret[hostId ? "hostmacroid" : "globalmacroid"])
      .filter(Boolean);

    if (macroIds.length === 0) return;

    const payload = {
      jsonrpc: "2.0" as const,
      method: hostId ? "usermacro.delete" : "usermacro.deleteglobal",
      params: macroIds,
      id: 1
    };

    const response: ZabbixApiResponse<ZabbixMacroDeleteResponse> = await request.post(apiUrl, payload, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiToken}`
      }
    });

    handleZabbixResponse(response);
  } catch (error) {
    throw new SecretSyncError({
      error: error instanceof Error ? error : new Error("Failed to delete Zabbix secrets")
    });
  }
};

export const ZabbixSyncFns = {
  syncSecrets: async (secretSync: TZabbixSyncWithCredentials, secretMap: TSecretMap) => {
    const { connection, environment, destinationConfig } = secretSync;
    const { apiToken, instanceUrl } = connection.credentials;
    await blockLocalAndPrivateIpAddresses(instanceUrl);

    const hostId = destinationConfig.scope === ZabbixSyncScope.Host ? destinationConfig.hostId : undefined;
    let secrets: TZabbixSecret[] = [];
    try {
      secrets = await listZabbixSecrets(apiToken, instanceUrl, hostId);
    } catch (error) {
      throw new SecretSyncError({
        error: error instanceof Error ? error : new Error("Failed to list Zabbix secrets")
      });
    }

    try {
      await putZabbixSecrets(apiToken, instanceUrl, secretMap, destinationConfig, secrets);
    } catch (error) {
      throw new SecretSyncError({
        error: error instanceof Error ? error : new Error("Failed to sync secrets")
      });
    }

    if (secretSync.syncOptions.disableSecretDeletion) return;

    try {
      const shapedSecretMapKeys = Object.keys(secretMap).map((key) => key.toUpperCase());

      const keys = secrets
        .filter(
          (secret) =>
            matchesSchema(secret.macro, environment?.slug || "", secretSync.syncOptions.keySchema) &&
            !shapedSecretMapKeys.includes(extractMacroKey(secret.macro))
        )
        .map((secret) => secret.macro);

      await deleteZabbixSecrets(apiToken, instanceUrl, keys, hostId);
    } catch (error) {
      throw new SecretSyncError({
        error: error instanceof Error ? error : new Error("Failed to delete orphaned secrets")
      });
    }
  },

  removeSecrets: async (secretSync: TZabbixSyncWithCredentials, secretMap: TSecretMap) => {
    const { connection, destinationConfig } = secretSync;
    const { apiToken, instanceUrl } = connection.credentials;
    await blockLocalAndPrivateIpAddresses(instanceUrl);

    const hostId = destinationConfig.scope === ZabbixSyncScope.Host ? destinationConfig.hostId : undefined;

    try {
      const secrets = await listZabbixSecrets(apiToken, instanceUrl, hostId);

      const shapedSecretMapKeys = Object.keys(secretMap).map((key) => key.toUpperCase());
      const keys = secrets
        .filter((secret) => shapedSecretMapKeys.includes(extractMacroKey(secret.macro)))
        .map((secret) => secret.macro);

      await deleteZabbixSecrets(apiToken, instanceUrl, keys, hostId);
    } catch (error) {
      throw new SecretSyncError({
        error: error instanceof Error ? error : new Error("Failed to remove secrets")
      });
    }
  },

  getSecrets: async (secretSync: TZabbixSyncWithCredentials) => {
    const { connection, destinationConfig } = secretSync;
    const { apiToken, instanceUrl } = connection.credentials;
    await blockLocalAndPrivateIpAddresses(instanceUrl);
    const hostId = destinationConfig.scope === ZabbixSyncScope.Host ? destinationConfig.hostId : undefined;

    try {
      const secrets = await listZabbixSecrets(apiToken, instanceUrl, hostId);
      return Object.fromEntries(
        secrets.map((secret) => [
          extractMacroKey(secret.macro),
          { value: secret.value ?? "", comment: secret.description }
        ])
      );
    } catch (error) {
      throw new SecretSyncError({
        error: error instanceof Error ? error : new Error("Failed to get secrets")
      });
    }
  }
};
