/* eslint-disable no-await-in-loop */
import { parseEnvFile, serializeEnvFile } from "@app/lib/dotenv";
import { removeTrailingSlash } from "@app/lib/fn";
import { safeRequest } from "@app/lib/validator";
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

const BATCH_SIZE = 5;

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

type TConfigElementInput = {
  key: string;
  value: string;
  writeOnly: boolean;
  type?: ElementType;
};

const batchAddContextConfigElements = async (
  instanceUrl: string,
  jwt: string,
  contextId: string,
  elements: TConfigElementInput[]
) => {
  const aliases = elements.map((_, i) => `add${i}: contextConfigAdd(context: $context, config: $c${i}) { id }`);
  const varDefs = [`$context: ID!`, ...elements.map((_, i) => `$c${i}: ConfigInput!`)];

  const query = `mutation BatchAdd(${varDefs.join(", ")}) {\n${aliases.join("\n")}\n}`;

  const variables: Record<string, unknown> = { context: contextId };
  for (let i = 0; i < elements.length; i += 1) {
    variables[`c${i}`] = {
      id: elements[i].key,
      value: elements[i].value,
      type: elements[i].type ?? "ENVIRONMENT_VARIABLE",
      writeOnly: elements[i].writeOnly
    };
  }

  await graphqlRequest(instanceUrl, jwt, query, variables);
};

const batchDeleteContextConfigElements = async (
  instanceUrl: string,
  jwt: string,
  contextId: string,
  keys: string[]
) => {
  const aliases = keys.map((_, i) => `del${i}: contextConfigDelete(context: $context, id: $id${i}) { id }`);
  const varDefs = [`$context: ID!`, ...keys.map((_, i) => `$id${i}: ID!`)];

  const query = `mutation BatchDelete(${varDefs.join(", ")}) {\n${aliases.join("\n")}\n}`;

  const variables: Record<string, unknown> = { context: contextId };
  for (let i = 0; i < keys.length; i += 1) {
    variables[`id${i}`] = keys[i];
  }

  await graphqlRequest(instanceUrl, jwt, query, variables);
};

const chunk = <T>(arr: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
};

const addConfigElements = async (
  instanceUrl: string,
  jwt: string,
  contextId: string,
  elements: TConfigElementInput[]
) => {
  for (const batch of chunk(elements, BATCH_SIZE)) {
    await batchAddContextConfigElements(instanceUrl, jwt, contextId, batch);
  }
};

const deleteConfigElements = async (instanceUrl: string, jwt: string, contextId: string, keys: string[]) => {
  for (const batch of chunk(keys, BATCH_SIZE)) {
    await batchDeleteContextConfigElements(instanceUrl, jwt, contextId, batch);
  }
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
  const prefix = toDirectoryPrefix(basePath);
  const sanitizedSecretMap = sanitizeSecretMapForEnvVars(secretMap);

  const elements: TConfigElementInput[] = Object.entries(sanitizedSecretMap).map(([key, { value }]) => ({
    key: `${prefix}${key}`,
    value: Buffer.from(value).toString("base64"),
    writeOnly,
    type: "FILE_MOUNT" as ElementType
  }));

  await addConfigElements(instanceUrl, jwt, contextId, elements);

  if (!disableSecretDeletion) {
    const existingElements = await getContextConfigElements(instanceUrl, jwt, contextId);

    const keysToDelete: string[] = [];
    for (const element of existingElements) {
      if (element.type !== "FILE_MOUNT" || !isDirectChild(element.id, prefix)) {
        // eslint-disable-next-line no-continue
        continue;
      }

      const key = getRelativeKey(element.id, prefix);
      if (!(key in sanitizedSecretMap)) {
        keysToDelete.push(element.id);
      }
    }

    await deleteConfigElements(instanceUrl, jwt, contextId, keysToDelete);
  }
};

const syncDotEnvFile = async (
  { instanceUrl, jwt, contextId }: TSpaceliftConnection,
  basePath: string,
  secretMap: TSecretMap,
  writeOnly: boolean,
  disableSecretDeletion?: boolean
) => {
  const sanitizedSecretMap = sanitizeSecretMapForEnvVars(secretMap);
  const hasSecrets = Object.keys(sanitizedSecretMap).length > 0;

  if (hasSecrets) {
    const envContent = secretMapToEnvFileContent(sanitizedSecretMap);
    const encoded = Buffer.from(envContent).toString("base64");
    await addConfigElements(instanceUrl, jwt, contextId, [
      { key: basePath, value: encoded, writeOnly, type: "FILE_MOUNT" }
    ]);
  } else if (!disableSecretDeletion) {
    await deleteConfigElements(instanceUrl, jwt, contextId, [basePath]);
  }
};

const getSecretsPerFile = (existingElements: TSpaceliftConfigElement[], basePath: string): TSecretMap => {
  const prefix = toDirectoryPrefix(basePath);
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
  const fileElement = existingElements.find((e) => e.id === basePath && e.type === "FILE_MOUNT");

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
  const prefix = toDirectoryPrefix(basePath);

  const keysToDelete: string[] = [];
  for (const element of existingElements) {
    if (element.type === "FILE_MOUNT" && isDirectChild(element.id, prefix)) {
      const secretKey = getRelativeKey(element.id, prefix);
      if (secretKey in secretMap) {
        keysToDelete.push(element.id);
      }
    }
  }

  await deleteConfigElements(instanceUrl, jwt, contextId, keysToDelete);
};

const removeDotEnvFile = async (
  { instanceUrl, jwt, contextId }: TSpaceliftConnection,
  existingElements: TSpaceliftConfigElement[],
  basePath: string
) => {
  const fileElement = existingElements.find((e) => e.id === basePath && e.type === "FILE_MOUNT");

  if (fileElement) {
    await deleteConfigElements(instanceUrl, jwt, contextId, [basePath]);
  }
};

export const SpaceliftSyncFns = {
  syncSecrets: async (secretSync: TSpaceliftSyncWithCredentials, secretMap: TSecretMap): Promise<void> => {
    const instanceUrl = removeTrailingSlash(secretSync.connection.credentials.apiUrl);
    const { apiKeyId, apiKeySecret } = secretSync.connection.credentials;
    const { contextId, configType, mountPath, fileMountFormat } = secretSync.destinationConfig;
    const writeOnly = secretSync.syncOptions?.writeOnly ?? false;
    const { disableSecretDeletion } = secretSync.syncOptions;

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

    const elements: TConfigElementInput[] = Object.entries(sanitizedSecretMap).map(([key, { value }]) => ({
      key,
      value,
      writeOnly
    }));

    await addConfigElements(instanceUrl, jwt, contextId, elements);

    if (disableSecretDeletion) return;

    const existingElements = await getContextConfigElements(instanceUrl, jwt, contextId);
    const existingSecrets = existingElements.filter((e) => e.type === "ENVIRONMENT_VARIABLE");

    const keysToDelete: string[] = [];
    for (const element of existingSecrets) {
      if (
        matchesSchema(element.id, secretSync.environment?.slug || "", secretSync.syncOptions.keySchema) &&
        !(element.id in sanitizedSecretMap)
      ) {
        keysToDelete.push(element.id);
      }
    }

    await deleteConfigElements(instanceUrl, jwt, contextId, keysToDelete);
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

    const keysToDelete: string[] = [];
    for (const element of existingElements) {
      if (element.type === "ENVIRONMENT_VARIABLE" && element.id in secretMap) {
        keysToDelete.push(element.id);
      }
    }

    await deleteConfigElements(instanceUrl, jwt, contextId, keysToDelete);
  }
};
