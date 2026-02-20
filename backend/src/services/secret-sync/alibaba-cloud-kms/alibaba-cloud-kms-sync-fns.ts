import { AxiosError } from "axios";

import { buildAlibabaCloudKmsParams, getAlibabaCloudKmsEndpoint } from "@app/services/app-connection/alibaba-cloud";
import { request } from "@app/lib/config/request";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import { TAlibabaCloudKMSSyncWithCredentials } from "./alibaba-cloud-kms-sync-types";

interface AlibabaSecretEntry {
  SecretName: string;
  SecretType: string;
  CreateTime: string;
  PlannedDeleteTime?: string;
}

interface ListSecretsResponse {
  SecretList: {
    Secret: AlibabaSecretEntry[];
  };
  PageNumber: number;
  PageSize: number;
  TotalCount: number;
  RequestId: string;
}

interface GetSecretValueResponse {
  SecretName: string;
  SecretData: string;
  SecretDataType: string;
  VersionId: string;
  VersionStages: { VersionStage: string[] };
  RequestId: string;
}

const getAlibabaKmsCredentials = (secretSync: TAlibabaCloudKMSSyncWithCredentials) => {
  const { credentials } = secretSync.connection;
  return {
    accessKeyId: credentials.accessKeyId,
    accessKeySecret: credentials.accessKeySecret,
    regionId: credentials.regionId
  };
};

const listAllSecrets = async (secretSync: TAlibabaCloudKMSSyncWithCredentials): Promise<AlibabaSecretEntry[]> => {
  const { accessKeyId, accessKeySecret, regionId } = getAlibabaKmsCredentials(secretSync);
  const endpoint = getAlibabaCloudKmsEndpoint(regionId);

  const secrets: AlibabaSecretEntry[] = [];
  let pageNumber = 1;
  const pageSize = 100;
  let totalCount = Infinity;

  while ((pageNumber - 1) * pageSize < totalCount) {
    // eslint-disable-next-line no-await-in-loop
    const params = buildAlibabaCloudKmsParams("ListSecrets", accessKeyId, accessKeySecret, {
      PageNumber: String(pageNumber),
      PageSize: String(pageSize),
      FetchTags: "false"
    });

    // eslint-disable-next-line no-await-in-loop
    const resp = await request.get<ListSecretsResponse>(endpoint, { params });

    const secretList = resp.data.SecretList?.Secret ?? [];
    secrets.push(...secretList);
    totalCount = resp.data.TotalCount;
    pageNumber += 1;
  }

  return secrets;
};

const getSecretValue = async (
  secretSync: TAlibabaCloudKMSSyncWithCredentials,
  secretName: string
): Promise<string> => {
  const { accessKeyId, accessKeySecret, regionId } = getAlibabaKmsCredentials(secretSync);
  const endpoint = getAlibabaCloudKmsEndpoint(regionId);

  const params = buildAlibabaCloudKmsParams("GetSecretValue", accessKeyId, accessKeySecret, {
    SecretName: secretName
  });

  const resp = await request.get<GetSecretValueResponse>(endpoint, { params });
  return resp.data.SecretData;
};

const createSecret = async (
  secretSync: TAlibabaCloudKMSSyncWithCredentials,
  secretName: string,
  secretValue: string
): Promise<void> => {
  const { accessKeyId, accessKeySecret, regionId } = getAlibabaKmsCredentials(secretSync);
  const endpoint = getAlibabaCloudKmsEndpoint(regionId);

  const params = buildAlibabaCloudKmsParams("CreateSecret", accessKeyId, accessKeySecret, {
    SecretName: secretName,
    SecretData: secretValue,
    VersionId: "v1"
  });

  await request.get(endpoint, { params });
};

const putSecretValue = async (
  secretSync: TAlibabaCloudKMSSyncWithCredentials,
  secretName: string,
  secretValue: string
): Promise<void> => {
  const { accessKeyId, accessKeySecret, regionId } = getAlibabaKmsCredentials(secretSync);
  const endpoint = getAlibabaCloudKmsEndpoint(regionId);

  // VersionId must be unique; use a timestamp-based ID
  const versionId = `v${Date.now()}`;

  const params = buildAlibabaCloudKmsParams("PutSecretValue", accessKeyId, accessKeySecret, {
    SecretName: secretName,
    SecretData: secretValue,
    VersionId: versionId,
    VersionStages: '["ACSCurrent"]'
  });

  await request.get(endpoint, { params });
};

const deleteSecret = async (
  secretSync: TAlibabaCloudKMSSyncWithCredentials,
  secretName: string
): Promise<void> => {
  const { accessKeyId, accessKeySecret, regionId } = getAlibabaKmsCredentials(secretSync);
  const endpoint = getAlibabaCloudKmsEndpoint(regionId);

  const params = buildAlibabaCloudKmsParams("DeleteSecret", accessKeyId, accessKeySecret, {
    SecretName: secretName,
    ForceDeleteWithoutRecovery: "true"
  });

  await request.get(endpoint, { params });
};

const getSecretNameWithPrefix = (key: string, prefix?: string): string =>
  prefix ? `${prefix}${key}` : key;

const stripPrefix = (name: string, prefix?: string): string => {
  if (!prefix) return name;
  return name.startsWith(prefix) ? name.slice(prefix.length) : name;
};

export const AlibabaCloudKMSSyncFns = {
  syncSecrets: async (secretSync: TAlibabaCloudKMSSyncWithCredentials, secretMap: TSecretMap): Promise<void> => {
    const { environment, syncOptions, destinationConfig } = secretSync;
    const prefix = destinationConfig.secretPrefix;

    const existingSecrets = await listAllSecrets(secretSync);
    const existingNames = new Set(existingSecrets.map((s) => s.SecretName));

    for await (const [key, { value }] of Object.entries(secretMap)) {
      if (!value) continue;

      const secretName = getSecretNameWithPrefix(key, prefix);

      try {
        if (existingNames.has(secretName)) {
          const currentValue = await getSecretValue(secretSync, secretName);
          if (currentValue !== value) {
            await putSecretValue(secretSync, secretName, value);
          }
        } else {
          await createSecret(secretSync, secretName, value);
        }
      } catch (error) {
        throw new SecretSyncError({
          error: error instanceof AxiosError ? error : undefined,
          secretKey: key
        });
      }
    }

    if (syncOptions.disableSecretDeletion) return;

    for await (const { SecretName } of existingSecrets) {
      if (!matchesSchema(SecretName, environment?.slug || "", syncOptions.keySchema)) continue;

      const infisicalKey = stripPrefix(SecretName, prefix);

      if (!(infisicalKey in secretMap) || !secretMap[infisicalKey].value) {
        try {
          await deleteSecret(secretSync, SecretName);
        } catch (error) {
          throw new SecretSyncError({
            error: error instanceof AxiosError ? error : undefined,
            secretKey: infisicalKey
          });
        }
      }
    }
  },

  getSecrets: async (secretSync: TAlibabaCloudKMSSyncWithCredentials): Promise<TSecretMap> => {
    const { destinationConfig } = secretSync;
    const prefix = destinationConfig.secretPrefix;

    const existingSecrets = await listAllSecrets(secretSync);
    const secretMap: TSecretMap = {};

    for await (const { SecretName } of existingSecrets) {
      try {
        const value = await getSecretValue(secretSync, SecretName);
        const infisicalKey = stripPrefix(SecretName, prefix);
        secretMap[infisicalKey] = { value };
      } catch {
        // Skip secrets we cannot read
      }
    }

    return secretMap;
  },

  removeSecrets: async (secretSync: TAlibabaCloudKMSSyncWithCredentials, secretMap: TSecretMap): Promise<void> => {
    const { destinationConfig } = secretSync;
    const prefix = destinationConfig.secretPrefix;

    const existingSecrets = await listAllSecrets(secretSync);

    for await (const { SecretName } of existingSecrets) {
      const infisicalKey = stripPrefix(SecretName, prefix);

      if (infisicalKey in secretMap) {
        try {
          await deleteSecret(secretSync, SecretName);
        } catch (error) {
          throw new SecretSyncError({
            error: error instanceof AxiosError ? error : undefined,
            secretKey: infisicalKey
          });
        }
      }
    }
  }
};
