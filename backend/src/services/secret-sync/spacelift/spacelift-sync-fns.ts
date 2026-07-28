/* eslint-disable no-await-in-loop */
import { removeTrailingSlash } from "@app/lib/fn";
import { safeRequest } from "@app/lib/validator";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import { SpaceliftConfigType } from "./spacelift-sync-constants";
import { TSpaceliftSyncWithCredentials } from "./spacelift-sync-types";

type TSpaceliftConfigElement = {
  id: string;
  value: string;
  writeOnly: boolean;
  type?: string;
};

const authenticateSpacelift = async (instanceUrl: string, apiKeyId: string, apiKeySecret: string): Promise<string> => {
  const { data } = await safeRequest.post<{
    data?: { apiKeyUser?: { jwt: string } };
    errors?: { message: string }[];
  }>(`${instanceUrl}/graphql`, {
    query: `mutation GetSpaceliftToken($id: ID!, $secret: String!) { apiKeyUser(id: $id, secret: $secret) { jwt } }`,
    variables: { id: apiKeyId, secret: apiKeySecret }
  });

  if (data.errors?.length || !data.data?.apiKeyUser?.jwt) {
    throw new Error(`Failed to authenticate with Spacelift: ${data.errors?.[0]?.message ?? "no JWT returned"}`);
  }

  return data.data.apiKeyUser.jwt;
};

const graphqlRequest = async <T>(
  instanceUrl: string,
  jwt: string,
  query: string,
  variables?: Record<string, unknown>
) => {
  const { data } = await safeRequest.post<{ data?: T; errors?: { message: string }[] }>(
    `${instanceUrl}/graphql`,
    { query, variables },
    { headers: { Authorization: `Bearer ${jwt}` } }
  );

  if (data.errors?.length) {
    throw new Error(data.errors[0].message);
  }

  return data.data;
};

const getContextConfigElements = async (
  instanceUrl: string,
  jwt: string,
  contextId: string
): Promise<TSpaceliftConfigElement[]> => {
  const data = await graphqlRequest<{ context?: { config: TSpaceliftConfigElement[] } }>(
    instanceUrl,
    jwt,
    `query GetContextConfig($id: ID!) { context(id: $id) { config { id value writeOnly type } } }`,
    { id: contextId }
  );

  return data?.context?.config ?? [];
};

const addContextConfigElement = async (
  instanceUrl: string,
  jwt: string,
  contextId: string,
  key: string,
  value: string,
  writeOnly: boolean,
  type: "ENVIRONMENT_VARIABLE" | "FILE_MOUNT" = "ENVIRONMENT_VARIABLE"
) => {
  await graphqlRequest(
    instanceUrl,
    jwt,
    `mutation AddContextConfig($context: ID!, $config: ConfigInput!) {
      contextConfigAdd(context: $context, config: $config) { id }
    }`,
    {
      context: contextId,
      config: { id: key, value, type, writeOnly }
    }
  );
};

const deleteContextConfigElement = async (instanceUrl: string, jwt: string, contextId: string, key: string) => {
  await graphqlRequest(
    instanceUrl,
    jwt,
    `mutation DeleteContextConfig($context: ID!, $id: ID!) {
      contextConfigDelete(context: $context, id: $id) { id }
    }`,
    { context: contextId, id: key }
  );
};

const secretMapToEnvFileContent = (secretMap: TSecretMap): string => {
  return Object.entries(secretMap)
    .map(([key, { value }]) => `${key}=${value}`)
    .join("\n");
};

const envFileContentToSecretMap = (content: string): TSecretMap => {
  const secretMap: TSecretMap = {};

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.substring(0, eqIndex);
    const value = trimmed.substring(eqIndex + 1);
    secretMap[key] = { value };
  }

  return secretMap;
};


export const SpaceliftSyncFns = {
  syncSecrets: async (secretSync: TSpaceliftSyncWithCredentials, secretMap: TSecretMap): Promise<void> => {
    const instanceUrl = removeTrailingSlash(secretSync.connection.credentials.apiUrl);
    const { apiKeyId, apiKeySecret } = secretSync.connection.credentials;
    const { contextId, configType = SpaceliftConfigType.EnvironmentVariable, mountPath } = secretSync.destinationConfig;
    const writeOnly = secretSync.syncOptions?.writeOnly ?? false;

    const jwt = await authenticateSpacelift(instanceUrl, apiKeyId, apiKeySecret);
    const existingElements = await getContextConfigElements(instanceUrl, jwt, contextId);

    if (configType === SpaceliftConfigType.FileMount) {
      const filePath = mountPath!;
      const existingFile = existingElements.find((e) => e.id === filePath);

      if (existingFile) {
        await deleteContextConfigElement(instanceUrl, jwt, contextId, filePath);
      }

      if (Object.keys(secretMap).length > 0) {
        const envContent = secretMapToEnvFileContent(secretMap);
        const encoded = Buffer.from(envContent).toString("base64");
        await addContextConfigElement(instanceUrl, jwt, contextId, filePath, encoded, writeOnly, "FILE_MOUNT");
      }

      if (secretSync.syncOptions.disableSecretDeletion) return;

      for (const element of existingElements) {
        if (element.id === filePath) continue;
        if (element.type !== "FILE_MOUNT") continue;
        if (
          !matchesSchema(element.id, secretSync.environment?.slug || "", secretSync.syncOptions.keySchema)
        ) {
          continue;
        }

        try {
          await deleteContextConfigElement(instanceUrl, jwt, contextId, element.id);
        } catch (error) {
          throw new SecretSyncError({ error, secretKey: element.id });
        }
      }

      return;
    }

    const existingMap = new Map(existingElements.map((e) => [e.id, e]));

    for (const key of Object.keys(secretMap)) {
      try {
        const existing = existingMap.get(key);

        if (existing) {
          await deleteContextConfigElement(instanceUrl, jwt, contextId, key);
        }

        await addContextConfigElement(instanceUrl, jwt, contextId, key, secretMap[key].value, writeOnly);
      } catch (error) {
        throw new SecretSyncError({ error, secretKey: key });
      }
    }

    if (secretSync.syncOptions.disableSecretDeletion) return;

    for (const element of existingElements) {
      if (!matchesSchema(element.id, secretSync.environment?.slug || "", secretSync.syncOptions.keySchema)) {
        // eslint-disable-next-line no-continue
        continue;
      }

      if (!(element.id in secretMap)) {
        try {
          await deleteContextConfigElement(instanceUrl, jwt, contextId, element.id);
        } catch (error) {
          throw new SecretSyncError({ error, secretKey: element.id });
        }
      }
    }
  },

  getSecrets: async (secretSync: TSpaceliftSyncWithCredentials): Promise<TSecretMap> => {
    const instanceUrl = removeTrailingSlash(secretSync.connection.credentials.apiUrl);
    const { apiKeyId, apiKeySecret } = secretSync.connection.credentials;
    const { contextId, configType = SpaceliftConfigType.EnvironmentVariable, mountPath } = secretSync.destinationConfig;

    const jwt = await authenticateSpacelift(instanceUrl, apiKeyId, apiKeySecret);
    const existingElements = await getContextConfigElements(instanceUrl, jwt, contextId);

    if (configType === SpaceliftConfigType.FileMount) {
      const filePath = mountPath!;
      const fileElement = existingElements.find((e) => e.id === filePath);

      if (!fileElement || fileElement.writeOnly) return {};

      const decoded = Buffer.from(fileElement.value, "base64").toString("utf-8");
      return envFileContentToSecretMap(decoded);
    }

    const secretMap: TSecretMap = {};

    for (const element of existingElements) {
      if (!element.writeOnly) {
        secretMap[element.id] = { value: element.value };
      }
    }

    return secretMap;
  },

  removeSecrets: async (secretSync: TSpaceliftSyncWithCredentials, secretMap: TSecretMap): Promise<void> => {
    const instanceUrl = removeTrailingSlash(secretSync.connection.credentials.apiUrl);
    const { apiKeyId, apiKeySecret } = secretSync.connection.credentials;
    const { contextId, configType = SpaceliftConfigType.EnvironmentVariable, mountPath } = secretSync.destinationConfig;

    const jwt = await authenticateSpacelift(instanceUrl, apiKeyId, apiKeySecret);
    const existingElements = await getContextConfigElements(instanceUrl, jwt, contextId);

    if (configType === SpaceliftConfigType.FileMount) {
      const filePath = mountPath!;
      const fileElement = existingElements.find((e) => e.id === filePath);

      if (fileElement) {
        try {
          await deleteContextConfigElement(instanceUrl, jwt, contextId, filePath);
        } catch (error) {
          throw new SecretSyncError({ error, secretKey: filePath });
        }
      }

      return;
    }

    for (const element of existingElements) {
      if (Object.prototype.hasOwnProperty.call(secretMap, element.id)) {
        try {
          await deleteContextConfigElement(instanceUrl, jwt, contextId, element.id);
        } catch (error) {
          throw new SecretSyncError({ error, secretKey: element.id });
        }
      }
    }
  }
};
