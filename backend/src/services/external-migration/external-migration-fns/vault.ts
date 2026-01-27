import https from "node:https";

import axios, { AxiosInstance } from "axios";
import { v4 as uuidv4 } from "uuid";

import { TGatewayServiceFactory } from "@app/ee/services/gateway/gateway-service";
import { BadRequestError } from "@app/lib/errors";
import { GatewayProxyProtocol, withGatewayProxy } from "@app/lib/gateway";
import { logger } from "@app/lib/logger";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";

import { InfisicalImportData, VaultMappingType } from "../external-migration-types";

enum KvVersion {
  V1 = "1",
  V2 = "2"
}

type VaultData = {
  namespace: string;
  mount: string;
  path: string;
  secretData: Record<string, string>;
};

const vaultFactory = (gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">) => {
  const $gatewayProxyWrapper = async <T>(
    inputs: {
      gatewayId: string;
      targetHost?: string;
      targetPort?: number;
    },
    gatewayCallback: (host: string, port: number, httpsAgent?: https.Agent) => Promise<T>
  ): Promise<T> => {
    const relayDetails = await gatewayService.fnGetGatewayClientTlsByGatewayId(inputs.gatewayId);
    const [relayHost, relayPort] = relayDetails.relayAddress.split(":");

    const callbackResult = await withGatewayProxy(
      async (port, httpsAgent) => {
        const res = await gatewayCallback("http://localhost", port, httpsAgent);
        return res;
      },
      {
        protocol: GatewayProxyProtocol.Http,
        targetHost: inputs.targetHost,
        targetPort: inputs.targetPort,
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

    return callbackResult;
  };

  const getMounts = async (request: AxiosInstance) => {
    const response = await request
      .get<{
        data: Record<string, { accessor: string; options: { version?: string } | null; type: string }>;
      }>("/v1/sys/mounts")
      .catch((err) => {
        if (axios.isAxiosError(err)) {
          logger.error(err.response?.data, "External migration: Failed to get Vault mounts");
        }
        throw err;
      });
    return response.data.data;
  };

  const getPaths = async (
    request: AxiosInstance,
    { mountPath, secretPath = "" }: { mountPath: string; secretPath?: string },
    kvVersion: KvVersion
  ) => {
    try {
      if (kvVersion === KvVersion.V2) {
        // For KV v2: /v1/{mount}/metadata/{path}?list=true
        const path = secretPath ? `${mountPath}/metadata/${secretPath}` : `${mountPath}/metadata`;
        const response = await request.get<{
          data: {
            keys: string[];
          };
        }>(`/v1/${path}?list=true`);

        return response.data.data.keys;
      }

      // kv version v1: /v1/{mount}?list=true
      const path = secretPath ? `${mountPath}/${secretPath}` : mountPath;
      const response = await request.get<{
        data: {
          keys: string[];
        };
      }>(`/v1/${path}?list=true`);

      return response.data.data.keys;
    } catch (err) {
      if (axios.isAxiosError(err)) {
        logger.error(err.response?.data, "External migration: Failed to get Vault paths");
        if (err.response?.status === 404) {
          return null;
        }
      }
      throw err;
    }
  };

  const getSecrets = async (
    request: AxiosInstance,
    { mountPath, secretPath }: { mountPath: string; secretPath: string },
    kvVersion: KvVersion
  ) => {
    if (kvVersion === KvVersion.V2) {
      // For KV v2: /v1/{mount}/data/{path}
      const response = await request
        .get<{
          data: {
            data: Record<string, string> | null; // KV v2 has nested data structure. Can be null if it's a soft deleted secret.
            metadata: {
              created_time: string;
              deletion_time: string;
              destroyed: boolean;
              version: number;
            };
          };
        }>(`/v1/${mountPath}/data/${secretPath}`)
        .catch((err) => {
          if (axios.isAxiosError(err)) {
            // handle soft-deleted secrets (Vault returns 404 with metadata for soft deleted secrets)
            const vaultResponse = err.response?.data as { data?: { metadata?: { deletion_time?: string } } };

            if (err.response?.status === 404 && vaultResponse?.data?.metadata?.deletion_time) {
              logger.info(
                { secretPath, deletion_time: vaultResponse.data?.metadata?.deletion_time },
                "External migration: Skipping soft-deleted Vault secret"
              );
              return null;
            }

            logger.error(err.response?.data, "External migration: Failed to get Vault secret");
          }
          throw err;
        });

      // if null returned from catch, skip secret
      if (response === null) {
        return null;
      }

      return response.data.data.data;
    }

    // kv version v1

    const response = await request
      .get<{
        data: Record<string, string>; // KV v1 has flat data structure
        lease_duration: number;
        lease_id: string;
        renewable: boolean;
      }>(`/v1/${mountPath}/${secretPath}`)
      .catch((err) => {
        if (axios.isAxiosError(err)) {
          logger.error(err.response?.data, "External migration: Failed to get Vault secret");
        }
        throw err;
      });

    return response.data.data;
  };

  // helper function to check if a mount is KV v2 (will be useful if we add support for Vault KV v1)
  // const isKvV2Mount = (mountInfo: { type: string; options?: { version?: string } | null }) => {
  //   return mountInfo.type === "kv" && mountInfo.options?.version === "2";
  // };

  const recursivelyGetAllPaths = async (
    request: AxiosInstance,
    mountPath: string,
    kvVersion: KvVersion,
    currentPath: string = ""
  ): Promise<string[]> => {
    const paths = await getPaths(request, { mountPath, secretPath: currentPath }, kvVersion);

    if (paths === null || paths.length === 0) {
      return [];
    }

    const allSecrets: string[] = [];

    for await (const path of paths) {
      const cleanPath = path.endsWith("/") ? path.slice(0, -1) : path;
      const fullItemPath = currentPath ? `${currentPath}/${cleanPath}` : cleanPath;

      if (path.endsWith("/")) {
        // it's a folder so we recurse into it
        const subSecrets = await recursivelyGetAllPaths(request, mountPath, kvVersion, fullItemPath);
        allSecrets.push(...subSecrets);
      } else {
        // it's a secret so we add it to our results
        allSecrets.push(`${mountPath}/${fullItemPath}`);
      }
    }

    return allSecrets;
  };

  async function collectVaultData({
    baseUrl,
    namespace,
    accessToken,
    gatewayId
  }: {
    baseUrl: string;
    namespace?: string;
    accessToken: string;
    gatewayId?: string;
  }): Promise<VaultData[]> {
    const getData = async (host: string, port?: number, httpsAgent?: https.Agent) => {
      const allData: VaultData[] = [];

      const request = axios.create({
        baseURL: port ? `${host}:${port}` : host,
        headers: {
          "X-Vault-Token": accessToken,
          ...(namespace ? { "X-Vault-Namespace": namespace } : {})
        },
        httpsAgent
      });

      // Get all mounts in this namespace
      const mounts = await getMounts(request);

      for (const mount of Object.keys(mounts)) {
        if (!mount.endsWith("/")) {
          delete mounts[mount];
        }
      }

      for await (const [mountPath, mountInfo] of Object.entries(mounts)) {
        // skip non-KV mounts
        if (!mountInfo.type.startsWith("kv")) {
          // eslint-disable-next-line no-continue
          continue;
        }

        const kvVersion = mountInfo.options?.version === "2" ? KvVersion.V2 : KvVersion.V1;

        // get all paths in this mount
        const paths = await recursivelyGetAllPaths(request, `${mountPath.replace(/\/$/, "")}`, kvVersion);

        const cleanMountPath = mountPath.replace(/\/$/, "");

        for await (const secretPath of paths) {
          // get the actual secret data
          const secretData = await getSecrets(
            request,
            {
              mountPath: cleanMountPath,
              secretPath: secretPath.replace(`${cleanMountPath}/`, "")
            },
            kvVersion
          );

          if (secretData) {
            allData.push({
              namespace: namespace || "",
              mount: mountPath.replace(/\/$/, ""),
              path: secretPath.replace(`${cleanMountPath}/`, ""),
              secretData
            });
          }
        }
      }

      return allData;
    };

    let data;

    if (gatewayId) {
      const url = new URL(baseUrl);

      const { port, protocol, hostname } = url;
      const cleanedProtocol = protocol.slice(0, -1);

      data = await $gatewayProxyWrapper(
        {
          gatewayId,
          targetHost: `${cleanedProtocol}://${hostname}`,
          targetPort: port ? Number(port) : 8200 // 8200, default port for Vault self-hosted/dedicated
        },
        getData
      );
    } else {
      data = await getData(baseUrl);
    }

    return data;
  }

  return {
    collectVaultData,
    getMounts,
    getPaths,
    getSecrets,
    recursivelyGetAllPaths
  };
};

export const transformToInfisicalFormatNamespaceToProjects = (
  vaultData: VaultData[],
  mappingType: VaultMappingType
): InfisicalImportData => {
  const projects: Array<{ name: string; id: string }> = [];
  const environments: Array<{ name: string; id: string; projectId: string; envParentId?: string }> = [];
  const folders: Array<{ id: string; name: string; environmentId: string; parentFolderId?: string }> = [];
  const secrets: Array<{ id: string; name: string; environmentId: string; value: string; folderId?: string }> = [];

  // track created entities to avoid duplicates
  const projectMap = new Map<string, string>(); // namespace -> projectId
  const environmentMap = new Map<string, string>(); // namespace:mount -> environmentId
  const folderMap = new Map<string, string>(); // namespace:mount:folderPath -> folderId

  let environmentId: string = "";
  for (const data of vaultData) {
    const { namespace, mount, path, secretData } = data;

    if (mappingType === VaultMappingType.Namespace) {
      // create project (namespace)
      if (!projectMap.has(namespace)) {
        const projectId = uuidv4();
        projectMap.set(namespace, projectId);
        projects.push({
          name: namespace,
          id: projectId
        });
      }
      const projectId = projectMap.get(namespace)!;

      // create environment (mount)
      const envKey = `${namespace}:${mount}`;
      if (!environmentMap.has(envKey)) {
        environmentId = uuidv4();
        environmentMap.set(envKey, environmentId);
        environments.push({
          name: mount,
          id: environmentId,
          projectId
        });
      }
      environmentId = environmentMap.get(envKey)!;
    } else if (mappingType === VaultMappingType.KeyVault) {
      if (!projectMap.has(mount)) {
        const projectId = uuidv4();
        projectMap.set(mount, projectId);
        projects.push({
          name: mount,
          id: projectId
        });
      }
      const projectId = projectMap.get(mount)!;

      // create single "Production" environment per project, because we have no good way of determining environments from vault
      if (!environmentMap.has(mount)) {
        environmentId = uuidv4();
        environmentMap.set(mount, environmentId);
        environments.push({
          name: "Production",
          id: environmentId,
          projectId
        });
      }
      environmentId = environmentMap.get(mount)!;
    }

    // create folder structure
    let currentFolderId: string | undefined;
    let currentPath = "";

    const pathParts = path.split("/").filter(Boolean);
    const folderParts = pathParts;

    // create nested folder structure for the entire path
    for (const folderName of folderParts) {
      currentPath = currentPath ? `${currentPath}/${folderName}` : folderName;
      const folderKey = `${namespace}:${mount}:${currentPath}`;

      if (!folderMap.has(folderKey)) {
        const folderId = uuidv4();
        folderMap.set(folderKey, folderId);
        folders.push({
          id: folderId,
          name: folderName,
          environmentId,
          parentFolderId: currentFolderId || environmentId
        });
        currentFolderId = folderId;
      } else {
        currentFolderId = folderMap.get(folderKey)!;
      }
    }

    for (const [key, value] of Object.entries(secretData)) {
      secrets.push({
        id: uuidv4(),
        name: key,
        environmentId,
        value: String(value),
        folderId: currentFolderId
      });
    }
  }

  return {
    projects,
    environments,
    folders,
    secrets
  };
};

export const transformToInfisicalFormatKeyVaultToProjectsCustomC1 = (vaultData: VaultData[]): InfisicalImportData => {
  const projects: Array<{ name: string; id: string }> = [];
  const environments: Array<{ name: string; id: string; projectId: string; envParentId?: string }> = [];
  const folders: Array<{ id: string; name: string; environmentId: string; parentFolderId?: string }> = [];
  const secrets: Array<{ id: string; name: string; environmentId: string; value: string; folderId?: string }> = [];

  // track created entities to avoid duplicates
  const projectMap = new Map<string, string>(); // team name -> projectId
  const environmentMap = new Map<string, string>(); // team-name:envName -> environmentId
  const folderMap = new Map<string, string>(); // team-name:envName:folderPath -> folderId

  for (const data of vaultData) {
    const { path, secretData } = data;

    const pathParts = path.split("/").filter(Boolean);
    if (pathParts.length < 2) {
      // eslint-disable-next-line no-continue
      continue;
    }

    // first level: environment (dev, prod, staging, etc.)
    const environmentName = pathParts[0];
    // second level: team name (team1, team2, etc.)
    const teamName = pathParts[1];
    // remaining parts: folder structure
    const folderParts = pathParts.slice(2);

    // create project (team) if if doesn't exist
    if (!projectMap.has(teamName)) {
      const projectId = uuidv4();
      projectMap.set(teamName, projectId);
      projects.push({
        name: teamName,
        id: projectId
      });
    }
    const projectId = projectMap.get(teamName)!;

    // create environment (dev, prod, etc.) for team
    const envKey = `${teamName}:${environmentName}`;
    if (!environmentMap.has(envKey)) {
      const environmentId = uuidv4();
      environmentMap.set(envKey, environmentId);
      environments.push({
        name: environmentName,
        id: environmentId,
        projectId
      });
    }
    const environmentId = environmentMap.get(envKey)!;

    // create folder structure for path segments
    let currentFolderId: string | undefined;
    let currentPath = "";

    for (const folderName of folderParts) {
      currentPath = currentPath ? `${currentPath}/${folderName}` : folderName;
      const folderKey = `${teamName}:${environmentName}:${currentPath}`;

      if (!folderMap.has(folderKey)) {
        const folderId = uuidv4();
        folderMap.set(folderKey, folderId);
        folders.push({
          id: folderId,
          name: folderName,
          environmentId,
          parentFolderId: currentFolderId || environmentId
        });
        currentFolderId = folderId;
      } else {
        currentFolderId = folderMap.get(folderKey)!;
      }
    }

    for (const [key, value] of Object.entries(secretData)) {
      secrets.push({
        id: uuidv4(),
        name: key,
        environmentId,
        value: String(value),
        folderId: currentFolderId
      });
    }
  }

  return {
    projects,
    environments,
    folders,
    secrets
  };
};

// refer to internal doc for more details on which ID's belong to which orgs.
// when its a custom migration, then it doesn't matter which mapping type is used (as of now).
export const vaultMigrationTransformMappings: Record<
  string,
  (vaultData: VaultData[], mappingType: VaultMappingType) => InfisicalImportData
> = {
  "68c57ab3-cea5-41fc-ae38-e156b10c14d2": transformToInfisicalFormatKeyVaultToProjectsCustomC1
} as const;

export const importVaultDataFn = async (
  {
    vaultAccessToken,
    vaultNamespace,
    vaultUrl,
    mappingType,
    gatewayId,
    orgId
  }: {
    vaultAccessToken: string;
    vaultNamespace?: string;
    vaultUrl: string;
    mappingType: VaultMappingType;
    gatewayId?: string;
    orgId: string;
  },
  { gatewayService }: { gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId"> }
) => {
  await blockLocalAndPrivateIpAddresses(vaultUrl);

  if (mappingType === VaultMappingType.Namespace && !vaultNamespace) {
    throw new BadRequestError({
      message: "Vault namespace is required when project mapping type is set to namespace."
    });
  }

  let transformFn: (vaultData: VaultData[], mappingType: VaultMappingType) => InfisicalImportData;

  if (mappingType === VaultMappingType.Custom) {
    transformFn = vaultMigrationTransformMappings[orgId];

    if (!transformFn) {
      throw new BadRequestError({
        message: "Please contact our sales team to enable custom vault migrations."
      });
    }
  } else {
    transformFn = transformToInfisicalFormatNamespaceToProjects;
  }

  logger.info(
    { orgId, mappingType },
    `[importVaultDataFn]: Running ${orgId in vaultMigrationTransformMappings ? "custom" : "default"} transform`
  );

  const vaultApi = vaultFactory(gatewayService);

  const vaultData = await vaultApi.collectVaultData({
    accessToken: vaultAccessToken,
    baseUrl: vaultUrl,
    namespace: vaultNamespace,
    gatewayId
  });

  return transformFn(vaultData, mappingType);
};
