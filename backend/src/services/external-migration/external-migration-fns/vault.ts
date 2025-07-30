import axios, { AxiosInstance } from "axios";
import { v4 as uuidv4 } from "uuid";

import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";

import { InfisicalImportData, VaultMappingType } from "../external-migration-types";

type VaultData = {
  namespace: string;
  mount: string;
  path: string;
  secretData: Record<string, string>;
};

const vaultFactory = () => {
  const getMounts = async (request: AxiosInstance) => {
    const response = await request
      .get<
        Record<
          string,
          {
            accessor: string;
            options: {
              version?: string;
            } | null;
            type: string;
          }
        >
      >("/v1/sys/mounts")
      .catch((err) => {
        if (axios.isAxiosError(err)) {
          logger.error(err.response?.data, "External migration: Failed to get Vault mounts");
        }
        throw err;
      });
    return response.data;
  };

  const getPaths = async (
    request: AxiosInstance,
    { mountPath, secretPath = "" }: { mountPath: string; secretPath?: string }
  ) => {
    try {
      // For KV v2: /v1/{mount}/metadata/{path}?list=true
      const path = secretPath ? `${mountPath}/metadata/${secretPath}` : `${mountPath}/metadata`;
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
    { mountPath, secretPath }: { mountPath: string; secretPath: string }
  ) => {
    // For KV v2: /v1/{mount}/data/{path}
    const response = await request
      .get<{
        data: {
          data: Record<string, string>; // KV v2 has nested data structure
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
          logger.error(err.response?.data, "External migration: Failed to get Vault secret");
        }
        throw err;
      });

    return response.data.data.data;
  };

  // helper function to check if a mount is KV v2 (will be useful if we add support for Vault KV v1)
  // const isKvV2Mount = (mountInfo: { type: string; options?: { version?: string } | null }) => {
  //   return mountInfo.type === "kv" && mountInfo.options?.version === "2";
  // };

  const recursivelyGetAllPaths = async (
    request: AxiosInstance,
    mountPath: string,
    currentPath: string = ""
  ): Promise<string[]> => {
    const paths = await getPaths(request, { mountPath, secretPath: currentPath });

    if (paths === null || paths.length === 0) {
      return [];
    }

    const allSecrets: string[] = [];

    for await (const path of paths) {
      const cleanPath = path.endsWith("/") ? path.slice(0, -1) : path;
      const fullItemPath = currentPath ? `${currentPath}/${cleanPath}` : cleanPath;

      if (path.endsWith("/")) {
        // it's a folder so we recurse into it
        const subSecrets = await recursivelyGetAllPaths(request, mountPath, fullItemPath);
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
    accessToken
  }: {
    baseUrl: string;
    namespace?: string;
    accessToken: string;
  }): Promise<VaultData[]> {
    const request = axios.create({
      baseURL: baseUrl,
      headers: {
        "X-Vault-Token": accessToken,
        ...(namespace ? { "X-Vault-Namespace": namespace } : {})
      }
    });

    const allData: VaultData[] = [];

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

      // get all paths in this mount
      const paths = await recursivelyGetAllPaths(request, `${mountPath.replace(/\/$/, "")}`);

      const cleanMountPath = mountPath.replace(/\/$/, "");

      for await (const secretPath of paths) {
        // get the actual secret data
        const secretData = await getSecrets(request, {
          mountPath: cleanMountPath,
          secretPath: secretPath.replace(`${cleanMountPath}/`, "")
        });

        allData.push({
          namespace: namespace || "",
          mount: mountPath.replace(/\/$/, ""),
          path: secretPath.replace(`${cleanMountPath}/`, ""),
          secretData
        });
      }
    }

    return allData;
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

    if (path.includes("/")) {
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

export const importVaultDataFn = async ({
  vaultAccessToken,
  vaultNamespace,
  vaultUrl,
  mappingType
}: {
  vaultAccessToken: string;
  vaultNamespace?: string;
  vaultUrl: string;
  mappingType: VaultMappingType;
}) => {
  await blockLocalAndPrivateIpAddresses(vaultUrl);

  if (mappingType === VaultMappingType.Namespace && !vaultNamespace) {
    throw new BadRequestError({
      message: "Vault namespace is required when project mapping type is set to namespace."
    });
  }

  const vaultApi = vaultFactory();

  const vaultData = await vaultApi.collectVaultData({
    accessToken: vaultAccessToken,
    baseUrl: vaultUrl,
    namespace: vaultNamespace
  });

  const infisicalData = transformToInfisicalFormatNamespaceToProjects(vaultData, mappingType);

  return infisicalData;
};
