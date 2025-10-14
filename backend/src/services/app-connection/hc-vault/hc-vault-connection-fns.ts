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

import { HCVaultConnectionMethod } from "./hc-vault-connection-enums";
import {
  THCVaultConnection,
  THCVaultConnectionConfig,
  THCVaultMount,
  THCVaultMountResponse
} from "./hc-vault-connection-types";

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
  connection: THCVaultConnection,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  namespace?: string
) => {
  const instanceUrl = await getHCVaultInstanceUrl(connection);
  const accessToken = await getHCVaultAccessToken(connection, gatewayService);

  if (namespace && connection.credentials.namespace) {
    throw new BadRequestError({
      message: "Namespace cannot be specified when namespace is already set in the connection credentials"
    });
  }

  const targetNamespace = namespace || connection.credentials.namespace;

  try {
    const { data: listData } = await requestWithHCVaultGateway<{
      policies: string[];
    }>(connection, gatewayService, {
      url: `${instanceUrl}/v1/sys/policy`,
      method: "GET",
      headers: {
        "X-Vault-Token": accessToken,
        ...(targetNamespace ? { "X-Vault-Namespace": targetNamespace } : {})
      }
    });

    const policyNames = listData.policies || [];

    const policies = await Promise.all(
      policyNames.map(async (policyName) => {
        try {
          const { data: policyData } = await requestWithHCVaultGateway<{
            name: string;
            rules: string;
          }>(connection, gatewayService, {
            url: `${instanceUrl}/v1/sys/policy/${policyName}`,
            method: "GET",
            headers: {
              "X-Vault-Token": accessToken,
              ...(targetNamespace ? { "X-Vault-Namespace": targetNamespace } : {})
            }
          });

          return {
            name: policyData.name,
            rules: policyData.rules
          };
        } catch (error: unknown) {
          logger.error(error, `Unable to fetch policy details for ${policyName}`);
          return {
            name: policyName,
            rules: ""
          };
        }
      })
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
      url: `${instanceUrl}/v1/sys/namespaces`,
      method: "LIST",
      headers: {
        "X-Vault-Token": accessToken,
        ...(connection.credentials.namespace ? { "X-Vault-Namespace": connection.credentials.namespace } : {})
      }
    });

    // Transform using key_info if available, otherwise fall back to keys array
    const namespaces = (data.data.keys || []).map((namespaceKey) => {
      const keyInfo = data.data.key_info?.[namespaceKey];
      return {
        id: keyInfo?.id || namespaceKey.replace(/\/$/, ""), // Use Vault's ID if available, otherwise use the key
        name: namespaceKey.replace(/\/$/, "") // Remove trailing slash for display
      };
    });

    return namespaces;
  } catch (error: unknown) {
    // 404 means namespaces endpoint doesn't exist (Vault Community Edition)
    // Return empty array to gracefully degrade
    if (error instanceof AxiosError && error.response?.status === 404) {
      logger.info("Namespaces endpoint not available (likely Vault Community Edition). Returning empty list.");
      return [
        {
          id: "default",
          name: "default"
        }
      ];
    }

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

  if (namespace && connection.credentials.namespace) {
    throw new BadRequestError({
      message: "Namespace cannot be specified when namespace is already set in the connection credentials"
    });
  }

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
  connection: THCVaultConnection,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  namespace?: string
) => {
  const instanceUrl = await getHCVaultInstanceUrl(connection);
  const accessToken = await getHCVaultAccessToken(connection, gatewayService);

  if (namespace && connection.credentials.namespace) {
    throw new BadRequestError({
      message: "Namespace cannot be specified when namespace is already set in the connection credentials"
    });
  }

  const targetNamespace = namespace || connection.credentials.namespace;

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
          ...(targetNamespace ? { "X-Vault-Namespace": targetNamespace } : {})
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

  // Recursive function to get all secret paths in a mount
  const recursivelyGetAllPaths = async (
    mountPath: string,
    kvVersion: "1" | "2",
    currentPath: string = ""
  ): Promise<string[]> => {
    const paths = await getPaths(mountPath, currentPath, kvVersion);

    if (paths === null || paths.length === 0) {
      return [];
    }

    const allSecrets: string[] = [];

    // Process paths sequentially to maintain tree traversal order
    // eslint-disable-next-line no-restricted-syntax
    for (const path of paths) {
      const cleanPath = path.endsWith("/") ? path.slice(0, -1) : path;
      const fullItemPath = currentPath ? `${currentPath}/${cleanPath}` : cleanPath;

      if (path.endsWith("/")) {
        // it's a folder so we recurse into it
        // eslint-disable-next-line no-await-in-loop
        const subSecrets = await recursivelyGetAllPaths(mountPath, kvVersion, fullItemPath);
        allSecrets.push(...subSecrets);
      } else {
        // it's a secret so we add it to our results
        allSecrets.push(`${mountPath}/${fullItemPath}`);
      }
    }

    return allSecrets;
  };

  // Get all mounts
  const mounts = await listHCVaultMounts(connection, gatewayService, namespace);

  // Filter for KV mounts (kv, kv-v1, kv-v2)
  const kvMounts = mounts.filter((mount) => mount.type === "kv" || mount.type.startsWith("kv"));

  // Collect all secret paths from all KV mounts in parallel
  const allSecretPathsArrays = await Promise.all(
    kvMounts.map(async (mount) => {
      const kvVersion = mount.version === "2" ? "2" : "1";
      const cleanMountPath = mount.path.replace(/\/$/, ""); // Remove trailing slash
      return recursivelyGetAllPaths(cleanMountPath, kvVersion);
    })
  );

  // Flatten the arrays into a single array
  const allSecretPaths = allSecretPathsArrays.flat();

  return allSecretPaths;
};

export const getHCVaultSecretsForPath = async (
  connection: THCVaultConnection,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  namespace: string,
  secretPath: string
) => {
  const instanceUrl = await getHCVaultInstanceUrl(connection);
  const accessToken = await getHCVaultAccessToken(connection, gatewayService);

  if (connection.credentials.namespace && connection.credentials.namespace !== namespace) {
    throw new BadRequestError({
      message: "Specified namespace does not match the namespace in the connection credentials"
    });
  }

  const targetNamespace = namespace || connection.credentials.namespace;

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
          data: Record<string, string>; // KV v2 has nested data structure
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
          ...(targetNamespace ? { "X-Vault-Namespace": targetNamespace } : {})
        }
      });

      return data.data.data;
    }

    // For KV v1: /v1/{mount}/{path}
    const { data } = await requestWithHCVaultGateway<{
      data: Record<string, string>; // KV v1 has flat data structure
      lease_duration: number;
      lease_id: string;
      renewable: boolean;
    }>(connection, gatewayService, {
      url: `${instanceUrl}/v1/${mountPath}/${actualPath}`,
      method: "GET",
      headers: {
        "X-Vault-Token": accessToken,
        ...(targetNamespace ? { "X-Vault-Namespace": targetNamespace } : {})
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
