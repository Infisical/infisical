/* eslint-disable no-await-in-loop */
import { parseEnvFile, serializeEnvFile } from "@app/lib/dotenv";
import { removeTrailingSlash } from "@app/lib/fn";
import { safeRequest } from "@app/lib/validator";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import { SpaceliftConfigType, SpaceliftFileMountFormat } from "./spacelift-sync-constants";
import { TSpaceliftSyncWithCredentials } from "./spacelift-sync-types";

type TSpaceliftConfigElement = {
  id: string;
  value: string;
  writeOnly: boolean;
  type?: ElementType;
};

type ElementType = "ENVIRONMENT_VARIABLE" | "FILE_MOUNT";

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
  type: ElementType = "ENVIRONMENT_VARIABLE"
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

const sanitizeEnvVarName = (name: string): string => {
  let sanitized = name.replace(/[^a-zA-Z0-9_]/g, "");
  if (sanitized.length > 0 && /^[0-9]/.test(sanitized)) {
    sanitized = `_${sanitized}`;
  }
  return sanitized;
};

const sanitizeSecretMapForEnvVars = (secretMap: TSecretMap): TSecretMap => {
  const sanitized: TSecretMap = {};
  for (const [key, entry] of Object.entries(secretMap)) {
    const sanitizedKey = sanitizeEnvVarName(key);
    if (sanitizedKey.length > 0) {
      sanitized[sanitizedKey] = entry;
    }
  }
  return sanitized;
};

const toDirectoryPrefix = (path: string): string => {
  if (!path) return "";
  if (path.endsWith("/")) return path;
  return `${path}/`;
};

const buildFileMountPrefix = (basePath: string): string => {
  return `/mnt/workspace/${toDirectoryPrefix(basePath)}`;
};

const buildFileMountPath = (basePath: string): string => {
  return `/mnt/workspace/${basePath}`;
};

const isDirectChild = (elementId: string, prefix: string): boolean => {
  if (!elementId.startsWith(prefix)) return false;
  const relativePath = elementId.slice(prefix.length);
  return relativePath.length > 0 && !relativePath.includes("/");
};

const getRelativeKey = (elementId: string, prefix: string): string => {
  return elementId.slice(prefix.length);
};

const secretMapToEnvFileContent = (secretMap: TSecretMap): string => {
  const flat: Record<string, string> = {};
  for (const [key, { value }] of Object.entries(secretMap)) {
    flat[key] = value;
  }
  return serializeEnvFile(flat);
};

const envFileContentToSecretMap = (content: string): TSecretMap => {
  const parsed = parseEnvFile(content);
  const secretMap: TSecretMap = {};
  for (const [key, value] of Object.entries(parsed)) {
    secretMap[key] = { value };
  }
  return secretMap;
};

type TSpaceliftConnection = {
  instanceUrl: string;
  jwt: string;
  contextId: string;
};

const syncSecretPerFile = async (
  { instanceUrl, jwt, contextId }: TSpaceliftConnection,
  basePath: string,
  secretMap: TSecretMap,
  writeOnly: boolean,
  disableSecretDeletion?: boolean
) => {
  const prefix = buildFileMountPrefix(basePath);

  for (const [key, { value }] of Object.entries(secretMap)) {
    const fileId = `${prefix}${key}`;
    const encoded = Buffer.from(value).toString("base64");

    try {
      await addContextConfigElement(instanceUrl, jwt, contextId, fileId, encoded, writeOnly, "FILE_MOUNT");
    } catch (error) {
      throw new SecretSyncError({ error, secretKey: key });
    }
  }

  if (!disableSecretDeletion) {
    const existingElements = await getContextConfigElements(instanceUrl, jwt, contextId);

    for (const element of existingElements) {
      if (element.type !== "FILE_MOUNT" || !isDirectChild(element.id, prefix)) {
        // eslint-disable-next-line no-continue
        continue;
      }

      const key = getRelativeKey(element.id, prefix);
      if (!(key in secretMap)) {
        try {
          await deleteContextConfigElement(instanceUrl, jwt, contextId, element.id);
        } catch (error) {
          throw new SecretSyncError({ error, secretKey: key });
        }
      }
    }
  }
};

const syncDotEnvFile = async (
  { instanceUrl, jwt, contextId }: TSpaceliftConnection,
  basePath: string,
  secretMap: TSecretMap,
  writeOnly: boolean,
  disableSecretDeletion?: boolean
) => {
  const filePath = buildFileMountPath(basePath);
  const hasSecrets = Object.keys(secretMap).length > 0;

  if (hasSecrets) {
    const envContent = secretMapToEnvFileContent(secretMap);
    const encoded = Buffer.from(envContent).toString("base64");
    await addContextConfigElement(instanceUrl, jwt, contextId, filePath, encoded, writeOnly, "FILE_MOUNT");
  } else if (!disableSecretDeletion) {
    await deleteContextConfigElement(instanceUrl, jwt, contextId, filePath);
  }
};

const getSecretsPerFile = (existingElements: TSpaceliftConfigElement[], basePath: string): TSecretMap => {
  const prefix = buildFileMountPrefix(basePath);
  const secretMap: TSecretMap = {};

  for (const element of existingElements) {
    if (element.type === "FILE_MOUNT" && !element.writeOnly && isDirectChild(element.id, prefix)) {
      const secretKey = getRelativeKey(element.id, prefix);
      secretMap[secretKey] = { value: Buffer.from(element.value, "base64").toString("utf-8") };
    }
  }

  return secretMap;
};

const getSecretsDotEnvFile = (existingElements: TSpaceliftConfigElement[], basePath: string): TSecretMap => {
  const filePath = buildFileMountPath(basePath);
  const fileElement = existingElements.find((e) => e.id === filePath && e.type === "FILE_MOUNT");

  if (!fileElement || fileElement.writeOnly) return {};

  const decoded = Buffer.from(fileElement.value, "base64").toString("utf-8");
  return envFileContentToSecretMap(decoded);
};

const removeSecretsPerFile = async (
  { instanceUrl, jwt, contextId }: TSpaceliftConnection,
  existingElements: TSpaceliftConfigElement[],
  basePath: string,
  secretMap: TSecretMap
) => {
  const prefix = buildFileMountPrefix(basePath);

  for (const element of existingElements) {
    if (element.type === "FILE_MOUNT" && isDirectChild(element.id, prefix)) {
      const secretKey = getRelativeKey(element.id, prefix);
      if (secretKey in secretMap) {
        try {
          await deleteContextConfigElement(instanceUrl, jwt, contextId, element.id);
        } catch (error) {
          throw new SecretSyncError({ error, secretKey });
        }
      }
    }
  }
};

const removeDotEnvFile = async (
  { instanceUrl, jwt, contextId }: TSpaceliftConnection,
  existingElements: TSpaceliftConfigElement[],
  basePath: string
) => {
  const filePath = buildFileMountPath(basePath);
  const fileElement = existingElements.find((e) => e.id === filePath && e.type === "FILE_MOUNT");

  if (fileElement) {
    try {
      await deleteContextConfigElement(instanceUrl, jwt, contextId, filePath);
    } catch (error) {
      throw new SecretSyncError({ error, secretKey: filePath });
    }
  }
};

export const SpaceliftSyncFns = {
  syncSecrets: async (secretSync: TSpaceliftSyncWithCredentials, secretMap: TSecretMap): Promise<void> => {
    const instanceUrl = removeTrailingSlash(secretSync.connection.credentials.apiUrl);
    const { apiKeyId, apiKeySecret } = secretSync.connection.credentials;
    const { contextId, configType, mountPath, fileMountFormat } = secretSync.destinationConfig;
    const writeOnly = secretSync.syncOptions?.writeOnly ?? false;
    const disableSecretDeletion = secretSync.syncOptions.disableSecretDeletion;

    const jwt = await authenticateSpacelift(instanceUrl, apiKeyId, apiKeySecret);
    const connection: TSpaceliftConnection = { instanceUrl, jwt, contextId };

    if (configType === SpaceliftConfigType.FileMount) {
      const basePath = mountPath ?? "";

      if (fileMountFormat === SpaceliftFileMountFormat.SecretPerFile) {
        await syncSecretPerFile(connection, basePath, secretMap, writeOnly, disableSecretDeletion);
      } else {
        await syncDotEnvFile(connection, basePath, secretMap, writeOnly, disableSecretDeletion);
      }

      return;
    }

    const sanitizedSecretMap = sanitizeSecretMapForEnvVars(secretMap);

    for (const key of Object.keys(sanitizedSecretMap)) {
      try {
        await addContextConfigElement(instanceUrl, jwt, contextId, key, sanitizedSecretMap[key].value, writeOnly);
      } catch (error) {
        throw new SecretSyncError({ error, secretKey: key });
      }
    }

    if (disableSecretDeletion) return;

    const existingElements = await getContextConfigElements(instanceUrl, jwt, contextId);
    const existingSecrets = existingElements.filter((e) => e.type === "ENVIRONMENT_VARIABLE");

    for (const element of existingSecrets) {
      if (
        matchesSchema(element.id, secretSync.environment?.slug || "", secretSync.syncOptions.keySchema) &&
        !(element.id in sanitizedSecretMap)
      ) {
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
    const { contextId, configType, mountPath, fileMountFormat } = secretSync.destinationConfig;

    const jwt = await authenticateSpacelift(instanceUrl, apiKeyId, apiKeySecret);
    const existingElements = await getContextConfigElements(instanceUrl, jwt, contextId);

    if (configType === SpaceliftConfigType.FileMount) {
      const basePath = mountPath ?? "";

      if (fileMountFormat === SpaceliftFileMountFormat.SecretPerFile) {
        return getSecretsPerFile(existingElements, basePath);
      }

      return getSecretsDotEnvFile(existingElements, basePath);
    }

    const secretMap: TSecretMap = {};

    for (const element of existingElements) {
      if (element.type === "ENVIRONMENT_VARIABLE" && !element.writeOnly) {
        secretMap[element.id] = { value: element.value };
      }
    }

    return secretMap;
  },

  removeSecrets: async (secretSync: TSpaceliftSyncWithCredentials, secretMap: TSecretMap): Promise<void> => {
    const instanceUrl = removeTrailingSlash(secretSync.connection.credentials.apiUrl);
    const { apiKeyId, apiKeySecret } = secretSync.connection.credentials;
    const { contextId, configType, mountPath, fileMountFormat } = secretSync.destinationConfig;

    const jwt = await authenticateSpacelift(instanceUrl, apiKeyId, apiKeySecret);
    const existingElements = await getContextConfigElements(instanceUrl, jwt, contextId);
    const connection: TSpaceliftConnection = { instanceUrl, jwt, contextId };

    if (configType === SpaceliftConfigType.FileMount) {
      const basePath = mountPath ?? "";

      if (fileMountFormat === SpaceliftFileMountFormat.SecretPerFile) {
        await removeSecretsPerFile(connection, existingElements, basePath, secretMap);
      } else {
        await removeDotEnvFile(connection, existingElements, basePath);
      }

      return;
    }

    const existingSecrets = existingElements.filter((e) => e.type === "ENVIRONMENT_VARIABLE");
    for (const element of existingSecrets) {
      if (element.id in secretMap) {
        try {
          await deleteContextConfigElement(instanceUrl, jwt, contextId, element.id);
        } catch (error) {
          throw new SecretSyncError({ error, secretKey: element.id });
        }
      }
    }
  }
};
