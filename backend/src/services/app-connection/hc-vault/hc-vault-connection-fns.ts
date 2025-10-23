import { AxiosError, AxiosRequestConfig, AxiosResponse } from "axios";
import https from "https";

import { verifyHostInputValidity } from "@app/ee/services/dynamic-secret/dynamic-secret-fns";
import { TGatewayServiceFactory } from "@app/ee/services/gateway/gateway-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { removeTrailingSlash } from "@app/lib/fn";
import { GatewayProxyProtocol, withGatewayProxy } from "@app/lib/gateway";
import { logger } from "@app/lib/logger";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { HCVaultAuthType, HCVaultConnectionMethod } from "./hc-vault-connection-enums";
import {
  THCVaultAuthMount,
  THCVaultAuthMountResponse,
  THCVaultConnection,
  THCVaultConnectionConfig,
  THCVaultKubernetesAuthConfig,
  THCVaultKubernetesAuthRole,
  THCVaultKubernetesAuthRoleWithConfig,
  THCVaultMount,
  THCVaultMountResponse
} from "./hc-vault-connection-types";

// HashiCorp Vault stores JSON data, so values can be any valid JSON type
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export const convertVaultValueToString = (value: JsonValue): string => {
  if (value === null) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  // For objects and arrays, serialize as JSON
  return JSON.stringify(value);
};

// Concurrency limit for HC Vault API requests to avoid rate limiting
const HC_VAULT_CONCURRENCY_LIMIT = 20;

/**
 * Creates a concurrency limiter that restricts the number of concurrent async operations
 * @param limit - Maximum number of concurrent operations
 * @returns A function that takes an async function and executes it with concurrency control
 */
const createConcurrencyLimiter = (limit: number) => {
  let activeCount = 0;
  const queue: Array<() => void> = [];

  const next = () => {
    activeCount -= 1;
    if (queue.length > 0) {
      const resolve = queue.shift();
      resolve?.();
    }
  };

  return async <T>(fn: () => Promise<T>): Promise<T> => {
    // If we're at the limit, wait in queue
    if (activeCount >= limit) {
      await new Promise<void>((resolve) => {
        queue.push(resolve);
      });
    }

    activeCount += 1;

    try {
      return await fn();
    } finally {
      next();
    }
  };
};

export const getHCVaultInstanceUrl = async (config: THCVaultConnectionConfig) => {
  const instanceUrl = removeTrailingSlash(config.credentials.instanceUrl);

  await blockLocalAndPrivateIpAddresses(instanceUrl);

  return instanceUrl;
};

export const getHCVaultConnectionListItem = () => ({
  name: "HCVault" as const,
  app: AppConnection.HCVault as const,
  methods: Object.values(HCVaultConnectionMethod) as [
    HCVaultConnectionMethod.AccessToken,
    HCVaultConnectionMethod.AppRole
  ]
});

type TokenRespData = {
  auth: {
    client_token: string;
  };
};

export const requestWithHCVaultGateway = async <T>(
  appConnection: { gatewayId?: string | null },
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  requestConfig: AxiosRequestConfig
): Promise<AxiosResponse<T>> => {
  const { gatewayId } = appConnection;

  // If gateway isn't set up, don't proxy request
  if (!gatewayId) {
    return request.request(requestConfig);
  }

  const url = new URL(requestConfig.url as string);

  await blockLocalAndPrivateIpAddresses(url.toString());

  const [targetHost] = await verifyHostInputValidity(url.hostname, true);
  const relayDetails = await gatewayService.fnGetGatewayClientTlsByGatewayId(gatewayId);
  const [relayHost, relayPort] = relayDetails.relayAddress.split(":");

  return withGatewayProxy(
    async (proxyPort) => {
      const httpsAgent = new https.Agent({
        servername: targetHost
      });

      url.protocol = "https:";
      url.host = `localhost:${proxyPort}`;

      const finalRequestConfig: AxiosRequestConfig = {
        ...requestConfig,
        url: url.toString(),
        httpsAgent,
        headers: {
          ...requestConfig.headers,
          Host: targetHost
        }
      };

      try {
        return await request.request(finalRequestConfig);
      } catch (error) {
        if (error instanceof AxiosError) {
          logger.error(
            { message: error.message, data: (error.response as undefined | { data: unknown })?.data },
            "Error during HashiCorp Vault gateway request:"
          );
        }
        throw error;
      }
    },
    {
      protocol: GatewayProxyProtocol.Tcp,
      targetHost,
      targetPort: url.port ? Number(url.port) : 8200, // 8200 is the default port for Vault self-hosted/dedicated
      relayHost,
      relayPort: Number(relayPort),
      identityId: relayDetails.identityId,
      orgId: relayDetails.orgId,
      tlsOptions: {
        ca: relayDetails.certChain,
        cert: relayDetails.certificate,
        key: relayDetails.privateKey.toString()
      }
    }
  );
};

export const getHCVaultAccessToken = async (
  connection: THCVaultConnection,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">
) => {
  // Return access token directly if not using AppRole method
  if (connection.method !== HCVaultConnectionMethod.AppRole) {
    return connection.credentials.accessToken;
  }

  // Generate temporary token for AppRole method
  try {
    const { instanceUrl, roleId, secretId } = connection.credentials;

    const tokenResp = await requestWithHCVaultGateway<TokenRespData>(connection, gatewayService, {
      url: `${removeTrailingSlash(instanceUrl)}/v1/auth/approle/login`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(connection.credentials.namespace ? { "X-Vault-Namespace": connection.credentials.namespace } : {})
      },
      data: { role_id: roleId, secret_id: secretId }
    });

    if (tokenResp.status !== 200) {
      throw new BadRequestError({
        message: `Unable to validate credentials: Hashicorp Vault responded with a status code of ${tokenResp.status} (${tokenResp.statusText}). Verify credentials and try again.`
      });
    }

    return tokenResp.data.auth.client_token;
  } catch (e: unknown) {
    throw new BadRequestError({
      message: "Unable to validate connection: verify credentials"
    });
  }
};

export const validateHCVaultConnectionCredentials = async (
  connection: THCVaultConnection,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">
) => {
  const instanceUrl = await getHCVaultInstanceUrl(connection);

  try {
    const accessToken = await getHCVaultAccessToken(connection, gatewayService);

    // Verify token
    await requestWithHCVaultGateway(connection, gatewayService, {
      url: `${instanceUrl}/v1/auth/token/lookup-self`,
      method: "GET",
      headers: { "X-Vault-Token": accessToken }
    });

    return connection.credentials;
  } catch (error: unknown) {
    logger.error(error, "Unable to verify HC Vault connection");

    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to validate credentials: ${error.message || "Unknown error"}`
      });
    }

    if (error instanceof BadRequestError) {
      throw error;
    }

    throw new BadRequestError({
      message: "Unable to validate connection: verify credentials"
    });
  }
};

export const listHCVaultPolicies = async (
  namespace: string,
  connection: THCVaultConnection,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">
) => {
  const instanceUrl = await getHCVaultInstanceUrl(connection);
  const accessToken = await getHCVaultAccessToken(connection, gatewayService);

  try {
    const { data: listData } = await requestWithHCVaultGateway<{
      data: {
        policies: string[];
      };
    }>(connection, gatewayService, {
      url: `${instanceUrl}/v1/sys/policy`,
      method: "GET",
      headers: {
        "X-Vault-Token": accessToken,
        "X-Vault-Namespace": namespace
      }
    });

    const policyNames = listData.data.policies || [];

    const limiter = createConcurrencyLimiter(HC_VAULT_CONCURRENCY_LIMIT);

    const policies = await Promise.all(
      policyNames.map((policyName) =>
        limiter(async () => {
          try {
            const { data: policyData } = await requestWithHCVaultGateway<{
              data: {
                name: string;
                rules: string;
              };
            }>(connection, gatewayService, {
              url: `${instanceUrl}/v1/sys/policy/${policyName}`,
              method: "GET",
              headers: {
                "X-Vault-Token": accessToken,
                "X-Vault-Namespace": namespace
              }
            });

            return {
              name: policyData.data.name,
              rules: policyData.data.rules
            };
          } catch (error: unknown) {
            logger.error(error, `Unable to fetch policy details for ${policyName}`);
            return {
              name: policyName,
              rules: ""
            };
          }
        })
      )
    );

    return policies;
  } catch (error: unknown) {
    logger.error(error, "Unable to list HC Vault policies");

    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to list policies: ${error.message || "Unknown error"}`
      });
    }

    throw new BadRequestError({
      message: "Unable to list policies from HashiCorp Vault"
    });
  }
};

export const listHCVaultNamespaces = async (
  connection: THCVaultConnection,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">
) => {
  const instanceUrl = await getHCVaultInstanceUrl(connection);
  const accessToken = await getHCVaultAccessToken(connection, gatewayService);

  const currentNamespace = connection.credentials.namespace || "/";

  // Helper function to fetch namespaces at a specific path
  const fetchNamespacesAtPath = async (namespacePath: string): Promise<string[] | null> => {
    try {
      const { data } = await requestWithHCVaultGateway<{
        data: {
          keys: string[];
          key_info?: {
            [key: string]: {
              id: string;
              path: string;
              custom_metadata?: Record<string, unknown>;
            };
          };
        };
      }>(connection, gatewayService, {
        url: `${instanceUrl}/v1/sys/namespaces?list=true`,
        method: "GET",
        headers: {
          "X-Vault-Token": accessToken,
          "X-Vault-Namespace": namespacePath
        }
      });

      return data.data.keys || [];
    } catch (error: unknown) {
      if (error instanceof AxiosError && error.response?.status === 404) {
        // No child namespaces at this path
        return null;
      }
      throw error;
    }
  };

  // Recursive function to get all namespaces at all depths with controlled parallelization
  const recursivelyGetAllNamespaces = async (
    parentPath: string,
    limiter: ReturnType<typeof createConcurrencyLimiter>
  ): Promise<string[]> => {
    const childKeys = await fetchNamespacesAtPath(parentPath);

    if (childKeys === null || childKeys.length === 0) {
      return [];
    }

    // Process namespaces in parallel with concurrency control
    const namespacesArrays = await Promise.all(
      childKeys.map((namespaceKey) =>
        limiter(async () => {
          // Remove trailing slash from the key
          const cleanNamespaceKey = namespaceKey.replace(/\/$/, "");

          // Build the full path
          let fullNamespacePath: string;
          if (parentPath === "/") {
            fullNamespacePath = cleanNamespaceKey;
          } else {
            fullNamespacePath = `${parentPath}/${cleanNamespaceKey}`;
          }

          // Recursively fetch child namespaces
          const childNamespaces = await recursivelyGetAllNamespaces(fullNamespacePath, limiter);

          // Return this namespace and all its children
          return [fullNamespacePath, ...childNamespaces];
        })
      )
    );

    // Flatten the arrays into a single array
    return namespacesArrays.flat();
  };

  try {
    // Create concurrency limiter to avoid overwhelming the Vault instance
    const limiter = createConcurrencyLimiter(HC_VAULT_CONCURRENCY_LIMIT);

    // Get all namespaces starting from currentNamespace
    const childNamespaces = await recursivelyGetAllNamespaces(currentNamespace, limiter);

    // Build the result array with full paths
    const namespaces = childNamespaces.map((path) => ({
      id: path,
      name: path
    }));

    // Always include the current/root namespace
    namespaces.unshift({
      id: currentNamespace,
      name: currentNamespace
    });

    return namespaces;
  } catch (error: unknown) {
    logger.error(error, "Unable to list HC Vault namespaces");

    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to list namespaces: ${error.message || "Unknown error"}`
      });
    }

    throw new BadRequestError({
      message: "Unable to list namespaces from HashiCorp Vault"
    });
  }
};

export const listHCVaultMounts = async (
  connection: THCVaultConnection,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  namespace?: string
) => {
  const instanceUrl = await getHCVaultInstanceUrl(connection);
  const accessToken = await getHCVaultAccessToken(connection, gatewayService);

  const targetNamespace = namespace || connection.credentials.namespace;

  const { data } = await requestWithHCVaultGateway<THCVaultMountResponse>(connection, gatewayService, {
    url: `${instanceUrl}/v1/sys/mounts`,
    method: "GET",
    headers: {
      "X-Vault-Token": accessToken,
      ...(targetNamespace ? { "X-Vault-Namespace": targetNamespace } : {})
    }
  });

  const mounts: THCVaultMount[] = [];

  Object.entries(data.data).forEach(([path, mount]) => {
    mounts.push({
      path,
      type: mount.type,
      version: mount.options?.version
    });
  });

  return mounts;
};

export const listHCVaultSecretPaths = async (
  namespace: string,
  connection: THCVaultConnection,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  filterMountPath?: string
) => {
  const instanceUrl = await getHCVaultInstanceUrl(connection);
  const accessToken = await getHCVaultAccessToken(connection, gatewayService);

  const getPaths = async (mountPath: string, secretPath: string, kvVersion: "1" | "2"): Promise<string[] | null> => {
    try {
      let path: string;
      if (kvVersion === "2") {
        // For KV v2: /v1/{mount}/metadata/{path}?list=true
        path = secretPath ? `${mountPath}/metadata/${secretPath}` : `${mountPath}/metadata`;
      } else {
        // For KV v1: /v1/{mount}/{path}?list=true
        path = secretPath ? `${mountPath}/${secretPath}` : mountPath;
      }

      const { data } = await requestWithHCVaultGateway<{
        data: {
          keys: string[];
        };
      }>(connection, gatewayService, {
        url: `${instanceUrl}/v1/${path}?list=true`,
        method: "GET",
        headers: {
          "X-Vault-Token": accessToken,
          "X-Vault-Namespace": namespace
        }
      });

      return data.data.keys;
    } catch (error) {
      if (error instanceof AxiosError && error.response?.status === 404) {
        return null;
      }

      throw error;
    }
  };

  // Recursive function to get all secret paths in a mount with controlled parallelization
  const recursivelyGetAllPaths = async (
    mountPath: string,
    kvVersion: "1" | "2",
    limiter: ReturnType<typeof createConcurrencyLimiter>,
    currentPath: string = ""
  ): Promise<string[]> => {
    const paths = await getPaths(mountPath, currentPath, kvVersion);

    if (paths === null || paths.length === 0) {
      return [];
    }

    // Process paths in parallel with concurrency control
    const secretPathsArrays = await Promise.all(
      paths.map((path) =>
        limiter(async () => {
          const cleanPath = path.endsWith("/") ? path.slice(0, -1) : path;
          const fullItemPath = currentPath ? `${currentPath}/${cleanPath}` : cleanPath;

          if (path.endsWith("/")) {
            // it's a folder so we recurse into it
            return recursivelyGetAllPaths(mountPath, kvVersion, limiter, fullItemPath);
          }
          // it's a secret so we return it
          return [`${mountPath}/${fullItemPath}`];
        })
      )
    );

    // Flatten the arrays into a single array
    return secretPathsArrays.flat();
  };

  // Get all mounts
  const mounts = await listHCVaultMounts(connection, gatewayService, namespace);

  // Filter for KV mounts (kv, kv-v1, kv-v2)
  let kvMounts = mounts.filter((mount) => mount.type === "kv" || mount.type.startsWith("kv"));

  // If filterMountPath is provided, filter to only that mount
  if (filterMountPath) {
    const normalizedFilterPath = filterMountPath.replace(/\/$/, ""); // Remove trailing slash
    kvMounts = kvMounts.filter((mount) => mount.path.replace(/\/$/, "") === normalizedFilterPath);
  }

  // Create concurrency limiter to avoid overwhelming the Vault instance
  const limiter = createConcurrencyLimiter(HC_VAULT_CONCURRENCY_LIMIT);

  // Collect all secret paths from all KV mounts in parallel
  const allSecretPathsArrays = await Promise.all(
    kvMounts.map(async (mount) => {
      const kvVersion = mount.version === "2" ? "2" : "1";
      const cleanMountPath = mount.path.replace(/\/$/, ""); // Remove trailing slash
      return recursivelyGetAllPaths(cleanMountPath, kvVersion, limiter);
    })
  );

  // Flatten the arrays into a single array
  const allSecretPaths = allSecretPathsArrays.flat();

  return allSecretPaths;
};

export const getHCVaultSecretsForPath = async (
  namespace: string,
  secretPath: string,
  connection: THCVaultConnection,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">
) => {
  const instanceUrl = await getHCVaultInstanceUrl(connection);
  const accessToken = await getHCVaultAccessToken(connection, gatewayService);

  try {
    // Extract mount and path from the secretPath
    // secretPath format: {mount}/{path}
    const pathParts = secretPath.split("/");
    const mountPath = pathParts[0];
    const actualPath = pathParts.slice(1).join("/");

    if (!mountPath || !actualPath) {
      throw new BadRequestError({
        message: "Invalid secret path format. Expected format: {mount}/{path}"
      });
    }

    // Get mounts to determine KV version
    const mounts = await listHCVaultMounts(connection, gatewayService, namespace);
    const mount = mounts.find((m) => m.path.replace(/\/$/, "") === mountPath);

    if (!mount) {
      throw new BadRequestError({
        message: `Mount '${mountPath}' not found in HashiCorp Vault`
      });
    }

    const kvVersion = mount.version === "2" ? "2" : "1";

    // Fetch secrets based on KV version
    if (kvVersion === "2") {
      // For KV v2: /v1/{mount}/data/{path}
      const { data } = await requestWithHCVaultGateway<{
        data: {
          data: Record<string, JsonValue>; // KV v2 has nested data structure, supports all JSON types
          metadata: {
            created_time: string;
            deletion_time: string;
            destroyed: boolean;
            version: number;
          };
        };
      }>(connection, gatewayService, {
        url: `${instanceUrl}/v1/${mountPath}/data/${actualPath}`,
        method: "GET",
        headers: {
          "X-Vault-Token": accessToken,
          "X-Vault-Namespace": namespace
        }
      });

      return data.data.data;
    }

    // For KV v1: /v1/{mount}/{path}
    const { data } = await requestWithHCVaultGateway<{
      data: Record<string, JsonValue>; // KV v1 has flat data structure, supports all JSON types
      lease_duration: number;
      lease_id: string;
      renewable: boolean;
    }>(connection, gatewayService, {
      url: `${instanceUrl}/v1/${mountPath}/${actualPath}`,
      method: "GET",
      headers: {
        "X-Vault-Token": accessToken,
        "X-Vault-Namespace": namespace
      }
    });

    return data.data;
  } catch (error: unknown) {
    logger.error(error, "Unable to fetch secrets from HC Vault path");

    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to fetch secrets: ${error.message || "Unknown error"}`
      });
    }

    if (error instanceof BadRequestError) {
      throw error;
    }

    throw new BadRequestError({
      message: "Unable to fetch secrets from HashiCorp Vault"
    });
  }
};

export const getHCVaultAuthMounts = async (
  namespace: string,
  authType: HCVaultAuthType | undefined,
  connection: THCVaultConnection,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">
): Promise<THCVaultAuthMount[]> => {
  const instanceUrl = await getHCVaultInstanceUrl(connection);
  const accessToken = await getHCVaultAccessToken(connection, gatewayService);

  try {
    const { data } = await requestWithHCVaultGateway<THCVaultAuthMountResponse>(connection, gatewayService, {
      url: `${instanceUrl}/v1/sys/auth`,
      method: "GET",
      headers: {
        "X-Vault-Token": accessToken,
        "X-Vault-Namespace": namespace
      }
    });

    const authMounts: THCVaultAuthMount[] = [];

    Object.entries(data.data).forEach(([path, authMethod]) => {
      // If authType is specified, filter by it; otherwise, include all
      if (!authType || authMethod.type === authType) {
        authMounts.push({
          path,
          type: authMethod.type,
          description: authMethod.description,
          accessor: authMethod.accessor
        });
      }
    });

    return authMounts;
  } catch (error: unknown) {
    const authTypeStr = authType || "all";
    logger.error(error, `Unable to list HC Vault ${authTypeStr} auth mounts`);

    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to list ${authTypeStr} auth mounts: ${error.message || "Unknown error"}`
      });
    }

    throw new BadRequestError({
      message: `Unable to list ${authTypeStr} auth mounts from HashiCorp Vault`
    });
  }
};

export const getHCVaultKubernetesAuthRoles = async (
  namespace: string,
  mountPath: string,
  connection: THCVaultConnection,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">
): Promise<THCVaultKubernetesAuthRoleWithConfig[]> => {
  const instanceUrl = await getHCVaultInstanceUrl(connection);
  const accessToken = await getHCVaultAccessToken(connection, gatewayService);

  // Remove trailing slash from mount path
  const cleanMountPath = mountPath.endsWith("/") ? mountPath.slice(0, -1) : mountPath;

  try {
    // 1. Get the Kubernetes auth configuration for this mount
    const { data: configResponse } = await requestWithHCVaultGateway<{ data: THCVaultKubernetesAuthConfig }>(
      connection,
      gatewayService,
      {
        url: `${instanceUrl}/v1/auth/${cleanMountPath}/config`,
        method: "GET",
        headers: {
          "X-Vault-Token": accessToken,
          "X-Vault-Namespace": namespace
        }
      }
    );

    const kubernetesConfig = configResponse.data;

    // 2. List all roles in this mount
    const { data: roleListResponse } = await requestWithHCVaultGateway<{ data: { keys: string[] } }>(
      connection,
      gatewayService,
      {
        url: `${instanceUrl}/v1/auth/${cleanMountPath}/role`,
        method: "LIST",
        headers: {
          "X-Vault-Token": accessToken,
          "X-Vault-Namespace": namespace
        }
      }
    );

    const roleNames = roleListResponse.data.keys;

    if (!roleNames || roleNames.length === 0) {
      return [];
    }

    // 3. Fetch details for each role with concurrency control
    const limiter = createConcurrencyLimiter(HC_VAULT_CONCURRENCY_LIMIT);

    const roleDetailsPromises = roleNames.map((roleName) =>
      limiter(async () => {
        const { data: roleResponse } = await requestWithHCVaultGateway<{ data: THCVaultKubernetesAuthRole }>(
          connection,
          gatewayService,
          {
            url: `${instanceUrl}/v1/auth/${cleanMountPath}/role/${roleName}`,
            method: "GET",
            headers: {
              "X-Vault-Token": accessToken,
              "X-Vault-Namespace": namespace
            }
          }
        );

        // 4. Merge the role with the config
        return {
          ...roleResponse.data,
          name: roleName,
          config: kubernetesConfig,
          mountPath: cleanMountPath
        } as THCVaultKubernetesAuthRoleWithConfig;
      })
    );

    const roles = await Promise.all(roleDetailsPromises);

    return roles;
  } catch (error: unknown) {
    logger.error(error, "Unable to list HC Vault Kubernetes auth roles");

    if (error instanceof AxiosError) {
      const errorMessage =
        (error.response?.data as { errors?: string[] })?.errors?.[0] || error.message || "Unknown error";
      throw new BadRequestError({
        message: `Failed to list Kubernetes auth roles: ${errorMessage}`
      });
    }

    throw new BadRequestError({
      message: "Unable to list Kubernetes auth roles from HashiCorp Vault"
    });
  }
};
