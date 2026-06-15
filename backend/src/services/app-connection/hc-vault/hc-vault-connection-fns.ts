import { AxiosError, AxiosRequestConfig, AxiosResponse } from "axios";
import https from "https";

import { verifyHostInputValidity } from "@app/ee/services/dynamic-secret/dynamic-secret-fns";
import { TGatewayServiceFactory } from "@app/ee/services/gateway/gateway-service";
import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { TGatewayV2ConnectionDetails } from "@app/ee/services/gateway-v2/gateway-v2-types";
import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { removeTrailingSlash } from "@app/lib/fn";
import { GatewayProxyProtocol, withGatewayProxy } from "@app/lib/gateway";
import { GatewayVersion, TGatewayV1RelayDetails } from "@app/lib/gateway/types";
import { withGatewayV2Proxy } from "@app/lib/gateway-v2/gateway-v2";
import { logger } from "@app/lib/logger";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { HCVaultAuthType, HCVaultConnectionMethod } from "./hc-vault-connection-enums";
import {
  TGatewayDetails,
  THCVaultAuthMount,
  THCVaultAuthMountResponse,
  THCVaultConnection,
  THCVaultConnectionConfig,
  THCVaultDatabaseConfig,
  THCVaultDatabaseRole,
  THCVaultKubernetesAuthConfig,
  THCVaultKubernetesAuthRole,
  THCVaultKubernetesAuthRoleWithConfig,
  THCVaultKubernetesRole,
  THCVaultKubernetesSecretsConfig,
  THCVaultLdapConfig,
  THCVaultLdapRole,
  THCVaultMount,
  THCVaultMountResponse
} from "./hc-vault-connection-types";

// HashiCorp Vault stores JSON data, so values can be any valid JSON type
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

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

// Helper to check if error is a 404
const isVault404Error = (error: unknown): boolean => {
  if (error && typeof error === "object" && "response" in error) {
    const axiosError = error as { response?: { status?: number } };
    return axiosError.response?.status === 404;
  }
  return false;
};

// Helper to check if error is 404 from gateway
const isGateway404Error = (error: unknown): boolean => {
  return error instanceof BadRequestError && error.message?.includes("Request failed with status code 404");
};

const isGateway403Error = (error: unknown): boolean => {
  return error instanceof BadRequestError && error.message?.includes("Request failed with status code 403");
};

const isGateway301Error = (error: unknown): boolean => {
  return error instanceof BadRequestError && error.message?.includes("Request failed with status code 301");
};

// Helper to extract error message from Vault API errors
const getVaultErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof AxiosError) {
    return (error.response?.data as { errors?: string[] })?.errors?.[0] || error.message || fallback;
  }
  return fallback;
};

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
  appConnection: { gatewayId?: string | null; gatewayPoolId?: string | null },
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
  requestConfig: AxiosRequestConfig,
  gatewayDetails?: TGatewayDetails,
  gatewayPoolService?: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">
): Promise<AxiosResponse<T>> => {
  const { gatewayId: directGatewayId, gatewayPoolId } = appConnection;

  if (gatewayPoolId && !gatewayPoolService) {
    throw new BadRequestError({
      message: "Pool-backed connections require gatewayPoolService at the call site"
    });
  }
  const gatewayId =
    gatewayPoolId && gatewayPoolService
      ? await gatewayPoolService.resolveEffectiveGatewayId({ gatewayId: directGatewayId, gatewayPoolId })
      : directGatewayId;

  const url = new URL(requestConfig.url as string);
  await blockLocalAndPrivateIpAddresses(url.toString(), Boolean(gatewayId));

  // If gateway isn't set up, don't proxy request
  if (!gatewayId) {
    return request.request(requestConfig);
  }

  let gatewayConnectionDetailsV2: TGatewayV2ConnectionDetails | undefined;

  if (gatewayDetails && gatewayDetails.gatewayVersion === GatewayVersion.V2) {
    gatewayConnectionDetailsV2 = gatewayDetails.details;
  }

  let targetHost: string;
  let targetPort: number;

  if (gatewayDetails) {
    targetHost = gatewayDetails.target.host;
    targetPort = gatewayDetails.target.port;
  } else {
    [targetHost] = await verifyHostInputValidity({ host: url.hostname, isGateway: true, isDynamicSecret: false });
    // port is empty string when using protocol's default port (443 for https, 80 for http)
    // eslint-disable-next-line no-nested-ternary
    targetPort = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
  }

  // if no gateway details are provided, we first try gateway v2, then gateway v1 as a fallback.
  if (!gatewayDetails) {
    gatewayConnectionDetailsV2 = await gatewayV2Service.getPlatformConnectionDetailsByGatewayId({
      gatewayId,
      targetHost,
      targetPort
    });
  }

  if (gatewayConnectionDetailsV2) {
    return withGatewayV2Proxy(
      async (proxyPort) => {
        const isHttps = url.protocol === "https:";

        url.host = `localhost:${proxyPort}`;

        const finalRequestConfig: AxiosRequestConfig = {
          ...requestConfig,
          url: url.toString(),
          headers: {
            ...requestConfig.headers,
            Host: targetHost
          },
          ...(isHttps && {
            httpsAgent: new https.Agent({
              servername: targetHost
            })
          })
        };

        try {
          return await request.request(finalRequestConfig);
        } catch (error) {
          if (error instanceof AxiosError) {
            logger.error(
              {
                error,
                message: error.message,
                data: (error.response as undefined | { data: unknown })?.data,
                url: url.toString()
              },
              "Error during HashiCorp Vault gateway request:"
            );
          }
          throw error;
        }
      },
      {
        protocol: GatewayProxyProtocol.Tcp,
        relayHost: gatewayConnectionDetailsV2.relayHost,
        gateway: gatewayConnectionDetailsV2.gateway,
        relay: gatewayConnectionDetailsV2.relay
      }
    );
  }

  let gatewayConnectionDetailsV1: TGatewayV1RelayDetails | undefined;
  if (gatewayDetails && gatewayDetails.gatewayVersion === GatewayVersion.V1) {
    gatewayConnectionDetailsV1 = gatewayDetails.details;
  } else {
    gatewayConnectionDetailsV1 = await gatewayService.fnGetGatewayClientTlsByGatewayId(gatewayId);
  }

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
            {
              error,
              message: error.message,
              data: (error.response as undefined | { data: unknown })?.data,
              url: url.toString()
            },
            "Error during HashiCorp Vault gateway request:"
          );
        }
        throw error;
      }
    },
    {
      relayDetails: gatewayConnectionDetailsV1,
      protocol: GatewayProxyProtocol.Tcp,
      targetHost,
      targetPort
    }
  );
};

export const getHCVaultAccessToken = async (
  connection: THCVaultConnection,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">
) => {
  // Return access token directly if not using AppRole method
  if (connection.method !== HCVaultConnectionMethod.AppRole) {
    return connection.credentials.accessToken;
  }

  // Generate temporary token for AppRole method
  try {
    const { instanceUrl, roleId, secretId } = connection.credentials;

    const tokenResp = await requestWithHCVaultGateway<TokenRespData>(connection, gatewayService, gatewayV2Service, {
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
    logger.error(e, "Failed to validate connection");
    throw new BadRequestError({
      message: "Unable to validate connection: verify credentials"
    });
  }
};

export const validateHCVaultConnectionCredentials = async (
  connection: THCVaultConnection,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">
) => {
  const instanceUrl = await getHCVaultInstanceUrl(connection);

  try {
    const accessToken = await getHCVaultAccessToken(connection, gatewayService, gatewayV2Service);

    // Verify token
    await requestWithHCVaultGateway(connection, gatewayService, gatewayV2Service, {
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

export const getHCVaultPolicyNames = async (
  namespace: string,
  connection: THCVaultConnection,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
  gatewayDetails?: TGatewayDetails
) => {
  const instanceUrl = await getHCVaultInstanceUrl(connection);
  const accessToken = await getHCVaultAccessToken(connection, gatewayService, gatewayV2Service);

  try {
    const { data: listData } = await requestWithHCVaultGateway<{
      data: {
        policies: string[];
      };
    }>(
      connection,
      gatewayService,
      gatewayV2Service,
      {
        url: `${instanceUrl}/v1/sys/policy`,
        method: "GET",
        headers: {
          "X-Vault-Token": accessToken,
          "X-Vault-Namespace": namespace
        }
      },
      gatewayDetails
    );

    const policyNames = listData.data.policies || [];

    return policyNames;
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

export const listHCVaultPolicies = async (
  namespace: string,
  connection: THCVaultConnection,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
  gatewayDetails?: TGatewayDetails
) => {
  const instanceUrl = await getHCVaultInstanceUrl(connection);
  const accessToken = await getHCVaultAccessToken(connection, gatewayService, gatewayV2Service);

  try {
    const policyNames = await getHCVaultPolicyNames(
      namespace,
      connection,
      gatewayService,
      gatewayV2Service,
      gatewayDetails
    );

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
            }>(
              connection,
              gatewayService,
              gatewayV2Service,
              {
                url: `${instanceUrl}/v1/sys/policy/${policyName}`,
                method: "GET",
                headers: {
                  "X-Vault-Token": accessToken,
                  "X-Vault-Namespace": namespace
                }
              },
              gatewayDetails
            );

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

const fetchHCVaultNamespacesWithoutNamespaceHeader = async ({
  connection,
  gatewayService,
  gatewayV2Service,
  instanceUrl,
  accessToken
}: {
  connection: THCVaultConnection;
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">;
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
  instanceUrl: string;
  accessToken: string;
}): Promise<string[]> => {
  try {
    const { data } = await requestWithHCVaultGateway<{
      data: { keys: string[] };
    }>(connection, gatewayService, gatewayV2Service, {
      url: `${instanceUrl}/v1/sys/namespaces?list=true`,
      method: "GET",
      headers: {
        "X-Vault-Token": accessToken
      }
    });

    return data.data.keys || [];
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to list namespaces: ${error.message || "Unknown error"}`
      });
    }
    throw error;
  }
};

export const listHCVaultNamespaces = async (
  connection: THCVaultConnection,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">
) => {
  const instanceUrl = await getHCVaultInstanceUrl(connection);
  const accessToken = await getHCVaultAccessToken(connection, gatewayService, gatewayV2Service);

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
      }>(connection, gatewayService, gatewayV2Service, {
        url: `${instanceUrl}/v1/sys/namespaces?list=true`,
        method: "GET",
        headers: {
          "X-Vault-Token": accessToken,
          "X-Vault-Namespace": namespacePath
        }
      });

      return data.data.keys || [];
    } catch (error: unknown) {
      if ((error instanceof AxiosError && error.response?.status === 404) || isGateway404Error(error)) {
        // No child namespaces at this path
        return null;
      }

      // vault 1.0.0 does not support namespace root or /, so we need to handle this case
      // if the error is 301 and the namespace path is /, try to fetch the namespaces without the namespace header
      if (
        ((error instanceof AxiosError && error.response?.status === 301) || isGateway301Error(error)) &&
        (namespacePath === "/" || namespacePath === "root")
      ) {
        return fetchHCVaultNamespacesWithoutNamespaceHeader({
          connection,
          gatewayService,
          gatewayV2Service,
          instanceUrl,
          accessToken
        });
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
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
  namespace?: string,
  gatewayDetails?: TGatewayDetails
) => {
  const instanceUrl = await getHCVaultInstanceUrl(connection);
  const accessToken = await getHCVaultAccessToken(connection, gatewayService, gatewayV2Service);

  const targetNamespace = namespace || connection.credentials.namespace;

  const fetchMounts = (namespaceHeader?: string) =>
    requestWithHCVaultGateway<THCVaultMountResponse>(
      connection,
      gatewayService,
      gatewayV2Service,
      {
        url: `${instanceUrl}/v1/sys/mounts`,
        method: "GET",
        headers: {
          "X-Vault-Token": accessToken,
          ...(namespaceHeader ? { "X-Vault-Namespace": namespaceHeader } : {})
        }
      },
      gatewayDetails
    );

  let data: THCVaultMountResponse;
  try {
    ({ data } = await fetchMounts(targetNamespace));
  } catch (error) {
    // vault 1.0.0 does not support namespace root or /, so we need to handle this case
    // if the error is 301 and the namespace is root or /, try to fetch mounts without the namespace header
    if (
      ((error instanceof AxiosError && error.response?.status === 301) || isGateway301Error(error)) &&
      (targetNamespace === "/" || targetNamespace === "root" || !targetNamespace)
    ) {
      ({ data } = await fetchMounts());
    } else {
      throw error;
    }
  }

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

// vault 1.0.0 does not support namespace root or /, responding with a 301 when the namespace header is sent.
// This sentinel signals the caller to retry the request without the X-Vault-Namespace header.
class NamespaceHeaderNotSupportedError extends Error {
  constructor() {
    super("HashiCorp Vault rejected the namespace header");
    this.name = "NamespaceHeaderNotSupportedError";
  }
}

const isRootNamespace = (namespace: string) => namespace === "/" || namespace === "root" || !namespace;

const isWildcardPath = (path: string) => path.split("/").includes("+");
const ACL_ALLOWED_CAPABILITIES = ["read", "list"];

// Fallback for restricted Vault tokens that lack permission to list a mount from its root.
// We ask Vault for the resultant ACL of the current token and derive the sub-paths within the
// given mount that the token is authorized for. These are returned relative to the mount, with the
// trailing slash preserved: an entry with a trailing slash (e.g. "team-a/") is a folder the caller
// should recurse into, while an entry without one (e.g. "team-a/db") is a concrete secret path.
const listHCVaultAccessiblePathsFromAcl = async (
  namespace: string,
  mountPath: string,
  kvVersion: "1" | "2",
  instanceUrl: string,
  accessToken: string,
  connection: THCVaultConnection,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
  gatewayDetails?: TGatewayDetails
): Promise<string[]> => {
  const fetchResultantAcl = (skipNamespaceHeader: boolean) =>
    requestWithHCVaultGateway<{
      data: {
        exact_paths?: Record<string, { capabilities: string[] }>;
        glob_paths?: Record<string, { capabilities: string[] }>;
      };
    }>(
      connection,
      gatewayService,
      gatewayV2Service,
      {
        url: `${instanceUrl}/v1/sys/internal/ui/resultant-acl`,
        method: "GET",
        headers: {
          "X-Vault-Token": accessToken,
          ...(skipNamespaceHeader ? {} : { "X-Vault-Namespace": namespace })
        }
      },
      gatewayDetails
    );

  // vault 1.0.0 does not support namespace root or /, responding with a 301 when the namespace header is sent.
  let data;
  try {
    ({ data } = await fetchResultantAcl(isRootNamespace(namespace)));
  } catch (error) {
    if (
      !isRootNamespace(namespace) &&
      ((error instanceof AxiosError && error.response?.status === 301) || isGateway301Error(error))
    ) {
      ({ data } = await fetchResultantAcl(true));
    } else {
      throw error;
    }
  }

  // ACL paths follow the pattern $NS/$MOUNT/... When the namespace is root there is no namespace segment, so the paths start
  // directly with the mount. We strip both the namespace and the mount to get a path relative to the
  // mount, keeping the trailing slash so the caller can tell folders ("team-a/") from secrets ("team-a/db").
  const nsPrefix = isRootNamespace(namespace) ? "" : `${removeTrailingSlash(namespace)}/`;
  const mountPrefix = `${removeTrailingSlash(mountPath)}/`;

  const stripKvV2Prefix = (path: string): string => {
    if (kvVersion !== "2") return path;
    if (path.startsWith("data/")) return path.slice("data/".length);
    if (path.startsWith("metadata/")) return path.slice("metadata/".length);
    return path;
  };

  const collectRelativePaths = (paths?: Record<string, { capabilities: string[] }>): string[] => {
    if (!paths) return [];

    return (
      Object.entries(paths)
        // Vault's "deny" capability overrides everything; only keep paths we can actually read or list.
        .filter(
          ([, { capabilities }]) =>
            !capabilities.includes("deny") && capabilities.some((cap) => ACL_ALLOWED_CAPABILITIES.includes(cap))
        )
        .map(([path]) => path)
        .map((path) => (nsPrefix && path.startsWith(nsPrefix) ? path.slice(nsPrefix.length) : path))
        .filter((path) => path.startsWith(mountPrefix))
        .map((path) => path.slice(mountPrefix.length))
        .map(stripKvV2Prefix)
        .filter((path) => removeTrailingSlash(path).length > 0)
    ); // drop the bare mount root (can't list it anyway)
  };

  const relativePaths = [...collectRelativePaths(data.data.exact_paths), ...collectRelativePaths(data.data.glob_paths)];

  return Array.from(new Set(relativePaths));
};

export const listHCVaultSecretPaths = async (
  namespace: string,
  connection: THCVaultConnection,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
  filterMountPath?: string,
  gatewayDetails?: TGatewayDetails
) => {
  const instanceUrl = await getHCVaultInstanceUrl(connection);
  const accessToken = await getHCVaultAccessToken(connection, gatewayService, gatewayV2Service);

  const getPaths = async (
    mountPath: string,
    secretPath: string,
    kvVersion: "1" | "2",
    skipNamespaceHeader: boolean = false
  ): Promise<string[] | null> => {
    let path: string;
    if (kvVersion === "2") {
      // For KV v2: /v1/{mount}/metadata/{path}?list=true
      path = secretPath ? `${mountPath}/metadata/${secretPath}` : `${mountPath}/metadata`;
    } else {
      // For KV v1: /v1/{mount}/{path}?list=true
      path = secretPath ? `${mountPath}/${secretPath}` : mountPath;
    }

    try {
      const { data } = await requestWithHCVaultGateway<{
        data: {
          keys: string[];
        };
      }>(
        connection,
        gatewayService,
        gatewayV2Service,
        {
          url: `${instanceUrl}/v1/${path}?list=true`,
          method: "GET",
          headers: {
            "X-Vault-Token": accessToken,
            ...(skipNamespaceHeader ? {} : { "X-Vault-Namespace": namespace })
          }
        },
        gatewayDetails
      );
      return data.data.keys;
    } catch (error) {
      if ((error instanceof AxiosError && error.response?.status === 404) || isGateway404Error(error)) {
        return null;
      }

      // vault 1.0.0 does not support namespace root or /, responding with a 301 when the namespace header is sent.
      // Signal the caller to retry the whole mount without the namespace header.
      if (
        !skipNamespaceHeader &&
        ((error instanceof AxiosError && error.response?.status === 301) || isGateway301Error(error)) &&
        (namespace === "/" || namespace === "root" || !namespace)
      ) {
        throw new NamespaceHeaderNotSupportedError();
      }

      throw error;
    }
  };

  const recursivelyGetAllPaths = async (
    mountPath: string,
    kvVersion: "1" | "2",
    limiter: ReturnType<typeof createConcurrencyLimiter>,
    currentPath: string = "",
    skipNamespaceHeader: boolean = false
  ): Promise<string[]> => {
    const paths = await limiter(() => getPaths(mountPath, currentPath, kvVersion, skipNamespaceHeader));

    if (paths === null || paths.length === 0) {
      return [];
    }

    // Process paths in parallel; concurrency is enforced on getPaths
    const secretPathsArrays = await Promise.all(
      paths.map(async (path) => {
        const cleanPath = path.endsWith("/") ? path.slice(0, -1) : path;
        const fullItemPath = currentPath ? `${currentPath}/${cleanPath}` : cleanPath;

        if (path.endsWith("/")) {
          // it's a folder so we recurse into it
          return recursivelyGetAllPaths(mountPath, kvVersion, limiter, fullItemPath, skipNamespaceHeader);
        }
        // it's a secret so we return it
        return [`${mountPath}/${fullItemPath}`];
      })
    );

    // Flatten the arrays into a single array
    return secretPathsArrays.flat();
  };

  // Recurse from each currentPath in parallel, retrying without the namespace header if Vault rejects it.
  const recurseFromPaths = async (
    cleanMountPath: string,
    kvVersion: "1" | "2",
    limiter: ReturnType<typeof createConcurrencyLimiter>,
    currentPaths: string[]
  ): Promise<string[]> => {
    const arrays = await Promise.all(
      currentPaths.map(async (currentPath) => {
        try {
          return await recursivelyGetAllPaths(cleanMountPath, kvVersion, limiter, currentPath);
        } catch (error) {
          // Vault rejected the namespace header (301 on root/"/"), retry without it.
          if (error instanceof NamespaceHeaderNotSupportedError) {
            return recursivelyGetAllPaths(cleanMountPath, kvVersion, limiter, currentPath, true);
          }
          throw error;
        }
      })
    );

    return arrays.flat();
  };

  // Get all mounts
  const mounts = await listHCVaultMounts(connection, gatewayService, gatewayV2Service, namespace);

  // Filter for KV mounts (kv, kv-v1, kv-v2)
  let kvMounts = mounts.filter((mount) => mount.type === "kv" || mount.type.startsWith("kv"));

  // If filterMountPath is provided, filter to only that mount
  if (filterMountPath) {
    const normalizedFilterPath = filterMountPath.replace(/\/$/, ""); // Remove trailing slash
    kvMounts = kvMounts.filter((mount) => mount.path.replace(/\/$/, "") === normalizedFilterPath);
  }

  // Create concurrency limiter to avoid overwhelming the Vault instance
  const limiter = createConcurrencyLimiter(HC_VAULT_CONCURRENCY_LIMIT);

  // Collect all secret paths from all KV mounts in parallel. Each entry returns the discovered secret
  // paths plus any paths skipped because they contain a "+" wildcard (only the resultant-ACL fallback
  // can surface wildcards; the normal listing flow always returns an empty skipped list).
  const perMountResults = await Promise.all(
    kvMounts.map(async (mount): Promise<{ secretPaths: string[]; skippedWildcardPaths: string[] }> => {
      const kvVersion = mount.version === "2" ? "2" : "1";
      const cleanMountPath = mount.path.replace(/\/$/, ""); // Remove trailing slash
      try {
        return {
          secretPaths: await recursivelyGetAllPaths(cleanMountPath, kvVersion, limiter),
          skippedWildcardPaths: []
        };
      } catch (error) {
        // Vault rejected the namespace header (301 on root/"/"), retry the mount without it.
        if (error instanceof NamespaceHeaderNotSupportedError) {
          return {
            secretPaths: await recursivelyGetAllPaths(cleanMountPath, kvVersion, limiter, "", true),
            skippedWildcardPaths: []
          };
        }

        // Restricted tokens may lack permission to list the mount from its root, returning a 403 on the
        // first listing. Fall back to the token's resultant ACL to discover the sub-paths it can access.
        if ((error instanceof AxiosError && error.response?.status === 403) || isGateway403Error(error)) {
          const accessiblePaths = await listHCVaultAccessiblePathsFromAcl(
            namespace,
            cleanMountPath,
            kvVersion,
            instanceUrl,
            accessToken,
            connection,
            gatewayService,
            gatewayV2Service,
            gatewayDetails
          );

          // Drop "+" wildcard paths: they can't be listed/recursed. Surface them so the user is informed.
          const skippedWildcardPaths = accessiblePaths
            .filter(isWildcardPath)
            .map((path) => `${cleanMountPath}/${removeTrailingSlash(path)}`);
          const usablePaths = accessiblePaths.filter((path) => !isWildcardPath(path));

          const directSecretPaths = usablePaths
            .filter((path) => !path.endsWith("/"))
            .map((path) => `${cleanMountPath}/${path}`);

          const folderPaths = usablePaths.filter((path) => path.endsWith("/")).map((path) => removeTrailingSlash(path));

          const recursedSecretPaths = await recurseFromPaths(cleanMountPath, kvVersion, limiter, folderPaths);

          return {
            secretPaths: Array.from(new Set([...directSecretPaths, ...recursedSecretPaths])),
            skippedWildcardPaths
          };
        }

        throw error;
      }
    })
  );

  // Flatten across mounts and dedupe both lists
  return {
    secretPaths: Array.from(new Set(perMountResults.flatMap((result) => result.secretPaths))),
    skippedWildcardPaths: Array.from(new Set(perMountResults.flatMap((result) => result.skippedWildcardPaths)))
  };
};

const fetchVaultSecretAtPath = async ({
  namespace,
  secretPath,
  mounts,
  instanceUrl,
  accessToken,
  connection,
  gatewayService,
  gatewayV2Service,
  skipNamespaceHeader = false
}: {
  namespace: string;
  secretPath: string;
  mounts: Awaited<ReturnType<typeof listHCVaultMounts>>;
  instanceUrl: string;
  accessToken: string;
  connection: THCVaultConnection;
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">;
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
  skipNamespaceHeader: boolean;
}): Promise<Record<string, JsonValue>> => {
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
      }>(connection, gatewayService, gatewayV2Service, {
        url: `${instanceUrl}/v1/${encodeURIComponent(mountPath)}/data/${actualPath}`,
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
    }>(connection, gatewayService, gatewayV2Service, {
      url: `${instanceUrl}/v1/${encodeURIComponent(mountPath)}/${actualPath}`,
      method: "GET",
      headers: {
        "X-Vault-Token": accessToken,
        ...(skipNamespaceHeader ? {} : { "X-Vault-Namespace": namespace })
      }
    });

    return data.data;
  } catch (error: unknown) {
    logger.error(error, "Unable to fetch secrets from HC Vault path");

    // vault 1.0.0 does not support namespace root or /, responding with a 301 when the namespace header is sent.
    // Signal the caller to retry the request without the namespace header.
    if (
      !skipNamespaceHeader &&
      ((error instanceof AxiosError && error.response?.status === 301) || isGateway301Error(error)) &&
      (namespace === "/" || namespace === "root" || !namespace)
    ) {
      throw new NamespaceHeaderNotSupportedError();
    }

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

export const getHCVaultSecretsForPaths = async (
  namespace: string,
  secretPaths: string[],
  connection: THCVaultConnection,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">
): Promise<Array<{ vaultSecretPath: string; secrets: Record<string, JsonValue> }>> => {
  const instanceUrl = await getHCVaultInstanceUrl(connection);
  const accessToken = await getHCVaultAccessToken(connection, gatewayService, gatewayV2Service);
  const mounts = await listHCVaultMounts(connection, gatewayService, gatewayV2Service, namespace);
  const limiter = createConcurrencyLimiter(HC_VAULT_CONCURRENCY_LIMIT);

  if (secretPaths.length === 0) {
    return [];
  }

  const fetchParams = {
    namespace,
    mounts,
    instanceUrl,
    accessToken,
    connection,
    gatewayService,
    gatewayV2Service
  };

  const fetchOne = async (vaultSecretPath: string, skipNamespaceHeader: boolean) => ({
    vaultSecretPath,
    secrets: await fetchVaultSecretAtPath({
      ...fetchParams,
      secretPath: vaultSecretPath,
      skipNamespaceHeader
    })
  });

  const [firstPath, ...restPaths] = secretPaths;

  // Probe with the first path: Vault 1.0.0 returns 301 for root/"/" when the namespace header is sent.
  // so we need to remove the namespace header and retry the request.
  let skipNamespaceHeader = false;
  let firstResult: { vaultSecretPath: string; secrets: Record<string, JsonValue> };
  try {
    firstResult = await fetchOne(firstPath, false);
  } catch (error) {
    if (error instanceof NamespaceHeaderNotSupportedError) {
      skipNamespaceHeader = true;
      firstResult = await fetchOne(firstPath, true);
    } else {
      throw error;
    }
  }

  if (restPaths.length === 0) {
    return [firstResult];
  }

  const restResults = await Promise.all(
    restPaths.map((vaultSecretPath) => limiter(() => fetchOne(vaultSecretPath, skipNamespaceHeader)))
  );

  return [firstResult, ...restResults];
};

export const getHCVaultAuthMounts = async (
  namespace: string,
  authType: HCVaultAuthType | undefined,
  connection: THCVaultConnection,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
  gatewayDetails?: TGatewayDetails
): Promise<THCVaultAuthMount[]> => {
  const instanceUrl = await getHCVaultInstanceUrl(connection);
  const accessToken = await getHCVaultAccessToken(connection, gatewayService, gatewayV2Service);

  try {
    const { data } = await requestWithHCVaultGateway<THCVaultAuthMountResponse>(
      connection,
      gatewayService,
      gatewayV2Service,
      {
        url: `${instanceUrl}/v1/sys/auth`,
        method: "GET",
        headers: {
          "X-Vault-Token": accessToken,
          "X-Vault-Namespace": namespace
        }
      },
      gatewayDetails
    );

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
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">
): Promise<THCVaultKubernetesAuthRoleWithConfig[]> => {
  const instanceUrl = await getHCVaultInstanceUrl(connection);
  const accessToken = await getHCVaultAccessToken(connection, gatewayService, gatewayV2Service);

  // Remove trailing slash from mount path
  const cleanMountPath = mountPath.endsWith("/") ? mountPath.slice(0, -1) : mountPath;

  try {
    // 1. Get the Kubernetes auth configuration for this mount
    const { data: configResponse } = await requestWithHCVaultGateway<{ data: THCVaultKubernetesAuthConfig }>(
      connection,
      gatewayService,
      gatewayV2Service,
      {
        url: `${instanceUrl}/v1/auth/${encodeURIComponent(cleanMountPath)}/config`,
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
      gatewayV2Service,
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
          gatewayV2Service,
          {
            url: `${instanceUrl}/v1/auth/${encodeURIComponent(cleanMountPath)}/role/${encodeURIComponent(roleName)}`,
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

export const getHCVaultKubernetesRoles = async (
  namespace: string,
  mountPath: string,
  connection: THCVaultConnection,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">
): Promise<THCVaultKubernetesRole[]> => {
  // Remove trailing slash from mount path
  const cleanMountPath = mountPath.endsWith("/") ? mountPath.slice(0, -1) : mountPath;

  try {
    const instanceUrl = await getHCVaultInstanceUrl(connection);
    const accessToken = await getHCVaultAccessToken(connection, gatewayService, gatewayV2Service);
    // 1. Get the Kubernetes secrets engine configuration for this mount
    const { data: configResponse } = await requestWithHCVaultGateway<{ data: THCVaultKubernetesSecretsConfig }>(
      connection,
      gatewayService,
      gatewayV2Service,
      {
        url: `${instanceUrl}/v1/${encodeURIComponent(cleanMountPath)}/config`,
        method: "GET",
        headers: {
          "X-Vault-Token": accessToken,
          "X-Vault-Namespace": namespace
        }
      }
    );

    const kubernetesConfig = configResponse.data;

    // 2. List all roles in this mount
    let roleNames: string[] = [];
    try {
      const { data: roleListResponse } = await requestWithHCVaultGateway<{ data: { keys: string[] } }>(
        connection,
        gatewayService,
        gatewayV2Service,
        {
          url: `${instanceUrl}/v1/${encodeURIComponent(cleanMountPath)}/roles?list=true`,
          method: "GET",
          headers: {
            "X-Vault-Token": accessToken,
            "X-Vault-Namespace": namespace
          }
        }
      );
      roleNames = roleListResponse.data.keys || [];
    } catch (error) {
      if (isVault404Error(error) || isGateway404Error(error)) return [];
      throw error;
    }

    if (!roleNames || roleNames.length === 0) {
      return [];
    }

    // 3. Fetch details for each role with concurrency control
    const limiter = createConcurrencyLimiter(HC_VAULT_CONCURRENCY_LIMIT);

    const roleDetailsPromises = roleNames.map((roleName) =>
      limiter(async () => {
        const { data: roleResponse } = await requestWithHCVaultGateway<{
          data: {
            allowed_kubernetes_namespaces?: string[];
            allowed_kubernetes_namespace_selector?: string;
            token_max_ttl?: number;
            token_default_ttl?: number;
            token_default_audiences?: string[];
            service_account_name?: string;
            kubernetes_role_name?: string;
            kubernetes_role_type?: string;
            generated_role_rules?: string;
            name_template?: string;
            extra_annotations?: Record<string, string>;
            extra_labels?: Record<string, string>;
          };
        }>(connection, gatewayService, gatewayV2Service, {
          url: `${instanceUrl}/v1/${encodeURIComponent(cleanMountPath)}/roles/${encodeURIComponent(roleName)}`,
          method: "GET",
          headers: {
            "X-Vault-Token": accessToken,
            "X-Vault-Namespace": namespace
          }
        });

        return {
          ...roleResponse.data,
          name: roleName,
          config: kubernetesConfig,
          mountPath: cleanMountPath
        } as THCVaultKubernetesRole;
      })
    );

    return await Promise.all(roleDetailsPromises);
  } catch (error: unknown) {
    logger.error(error, "Unable to list HC Vault Kubernetes secrets engine roles");
    throw new BadRequestError({
      message: `Failed to list Kubernetes secrets engine roles: ${getVaultErrorMessage(error, "Unknown error")}`
    });
  }
};

export const getHCVaultDatabaseRoles = async (
  namespace: string,
  mountPath: string,
  connection: THCVaultConnection,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">
): Promise<THCVaultDatabaseRole[]> => {
  // Remove trailing slash from mount path
  const cleanMountPath = mountPath.endsWith("/") ? mountPath.slice(0, -1) : mountPath;

  try {
    const instanceUrl = await getHCVaultInstanceUrl(connection);
    const accessToken = await getHCVaultAccessToken(connection, gatewayService, gatewayV2Service);

    // 1. List all database connections in this mount to get their configs
    let connectionNames: string[] = [];
    try {
      const { data: connectionListResponse } = await requestWithHCVaultGateway<{ data: { keys: string[] } }>(
        connection,
        gatewayService,
        gatewayV2Service,
        {
          url: `${instanceUrl}/v1/${encodeURIComponent(cleanMountPath)}/config?list=true`,
          method: "GET",
          headers: {
            "X-Vault-Token": accessToken,
            "X-Vault-Namespace": namespace
          }
        }
      );
      connectionNames = connectionListResponse.data.keys || [];
    } catch (error) {
      if (isVault404Error(error) || isGateway404Error(error)) return [];
      throw error;
    }

    // 2. Fetch config for each database connection
    const limiter = createConcurrencyLimiter(HC_VAULT_CONCURRENCY_LIMIT);
    const connectionConfigs: Map<string, THCVaultDatabaseConfig> = new Map();

    await Promise.all(
      connectionNames.map((connName) =>
        limiter(async () => {
          try {
            const { data: configResponse } = await requestWithHCVaultGateway<{
              data: THCVaultDatabaseConfig;
            }>(connection, gatewayService, gatewayV2Service, {
              url: `${instanceUrl}/v1/${encodeURIComponent(cleanMountPath)}/config/${encodeURIComponent(connName)}`,
              method: "GET",
              headers: {
                "X-Vault-Token": accessToken,
                "X-Vault-Namespace": namespace
              }
            });
            connectionConfigs.set(connName, configResponse.data);
          } catch {
            // Skip connections we can't read
          }
        })
      )
    );

    // 3. List all roles in this mount
    let roleNames: string[] = [];
    try {
      const { data: roleListResponse } = await requestWithHCVaultGateway<{ data: { keys: string[] } }>(
        connection,
        gatewayService,
        gatewayV2Service,
        {
          url: `${instanceUrl}/v1/${encodeURIComponent(cleanMountPath)}/roles?list=true`,
          method: "GET",
          headers: {
            "X-Vault-Token": accessToken,
            "X-Vault-Namespace": namespace
          }
        }
      );
      roleNames = roleListResponse.data.keys || [];
    } catch (error) {
      if (isVault404Error(error) || isGateway404Error(error)) return [];
      throw error;
    }

    if (!roleNames || roleNames.length === 0) {
      return [];
    }

    // 4. Fetch details for each role with concurrency control
    const roleDetailsPromises = roleNames.map((roleName) =>
      limiter(async () => {
        const { data: roleResponse } = await requestWithHCVaultGateway<{
          data: {
            db_name: string;
            default_ttl?: number;
            max_ttl?: number;
            creation_statements?: string[];
            revocation_statements?: string[];
            renew_statements?: string[];
          };
        }>(connection, gatewayService, gatewayV2Service, {
          url: `${instanceUrl}/v1/${encodeURIComponent(cleanMountPath)}/roles/${encodeURIComponent(roleName)}`,
          method: "GET",
          headers: {
            "X-Vault-Token": accessToken,
            "X-Vault-Namespace": namespace
          }
        });

        const dbConfig = connectionConfigs.get(roleResponse.data.db_name) || {
          plugin_name: "",
          connection_details: { connection_url: "" }
        };

        return {
          name: roleName,
          db_name: roleResponse.data.db_name,
          default_ttl: roleResponse.data.default_ttl,
          max_ttl: roleResponse.data.max_ttl,
          creation_statements: roleResponse.data.creation_statements,
          revocation_statements: roleResponse.data.revocation_statements,
          renew_statements: roleResponse.data.renew_statements,
          config: dbConfig,
          mountPath: cleanMountPath
        } as THCVaultDatabaseRole;
      })
    );

    return await Promise.all(roleDetailsPromises);
  } catch (error: unknown) {
    logger.error(error, "Unable to list HC Vault database secrets engine roles");
    throw new BadRequestError({
      message: `Failed to list database secrets engine roles: ${getVaultErrorMessage(error, "Unknown error")}`
    });
  }
};

export const getHCVaultLdapRoles = async (
  namespace: string,
  mountPath: string,
  connection: THCVaultConnection,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">
): Promise<THCVaultLdapRole[]> => {
  // Remove trailing slash from mount path
  const cleanMountPath = mountPath.endsWith("/") ? mountPath.slice(0, -1) : mountPath;

  try {
    const instanceUrl = await getHCVaultInstanceUrl(connection);
    const accessToken = await getHCVaultAccessToken(connection, gatewayService, gatewayV2Service);

    // 1. Get the LDAP secrets engine configuration for this mount
    const { data: configResponse } = await requestWithHCVaultGateway<{ data: THCVaultLdapConfig }>(
      connection,
      gatewayService,
      gatewayV2Service,
      {
        url: `${instanceUrl}/v1/${encodeURIComponent(cleanMountPath)}/config`,
        method: "GET",
        headers: {
          "X-Vault-Token": accessToken,
          "X-Vault-Namespace": namespace
        }
      }
    );

    const ldapConfig = configResponse.data;

    // 2. List all dynamic roles in this mount
    let roleNames: string[] = [];
    try {
      const { data: roleListResponse } = await requestWithHCVaultGateway<{ data: { keys: string[] } }>(
        connection,
        gatewayService,
        gatewayV2Service,
        {
          url: `${instanceUrl}/v1/${encodeURIComponent(cleanMountPath)}/role?list=true`,
          method: "GET",
          headers: {
            "X-Vault-Token": accessToken,
            "X-Vault-Namespace": namespace
          }
        }
      );
      roleNames = roleListResponse.data.keys || [];
    } catch (error) {
      if (isVault404Error(error) || isGateway404Error(error)) return [];
      throw error;
    }

    if (!roleNames || roleNames.length === 0) {
      return [];
    }

    // 3. Fetch details for each role with concurrency control
    const limiter = createConcurrencyLimiter(HC_VAULT_CONCURRENCY_LIMIT);

    const roleDetailsPromises = roleNames.map((roleName) =>
      limiter(async () => {
        const { data: roleResponse } = await requestWithHCVaultGateway<{
          data: {
            default_ttl?: number;
            max_ttl?: number;
            creation_ldif?: string;
            deletion_ldif?: string;
            rollback_ldif?: string;
            username_template?: string;
          };
        }>(connection, gatewayService, gatewayV2Service, {
          url: `${instanceUrl}/v1/${encodeURIComponent(cleanMountPath)}/role/${encodeURIComponent(roleName)}`,
          method: "GET",
          headers: {
            "X-Vault-Token": accessToken,
            "X-Vault-Namespace": namespace
          }
        });

        return {
          name: roleName,
          default_ttl: roleResponse.data.default_ttl,
          max_ttl: roleResponse.data.max_ttl,
          creation_ldif: roleResponse.data.creation_ldif,
          deletion_ldif: roleResponse.data.deletion_ldif,
          rollback_ldif: roleResponse.data.rollback_ldif,
          username_template: roleResponse.data.username_template,
          config: ldapConfig,
          mountPath: cleanMountPath
        } as THCVaultLdapRole;
      })
    );

    return await Promise.all(roleDetailsPromises);
  } catch (error: unknown) {
    logger.error(error, "Unable to list HC Vault LDAP secrets engine roles");
    throw new BadRequestError({
      message: `Failed to list LDAP secrets engine roles: ${getVaultErrorMessage(error, "Unknown error")}`
    });
  }
};
