import {
  BlobSASPermissions,
  BlockBlobClient,
  generateBlobSASQueryParameters,
  RestError,
  SASProtocol,
  UserDelegationKey
} from "@azure/storage-blob";

import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { TAppConnection } from "@app/services/app-connection/app-connection-types";
import {
  AzureBlobStorageConnectionMethod,
  getAzureBlobStorageServiceClient
} from "@app/services/app-connection/azure-blob-storage";
import {
  describeAzureStorageError,
  isAzureNetworkError
} from "@app/services/app-connection/azure-blob-storage/azure-blob-storage-connection-fns";

import { PAM_RECORDING_MAX_CHUNK_BYTES, PAM_RECORDING_PRESIGNED_URL_EXPIRY_SECONDS } from "../pam-recording-constants";
import {
  buildExternalChunkObjectKey,
  normalizeKeyPrefix,
  TPamRecordingAzureAccess,
  TPamRecordingResolvedConfig,
  TPamRecordingStorageProvider
} from "../pam-recording-storage-types";

const USER_DELEGATION_KEY_LIFETIME_MS = 60 * 60 * 1000;
const USER_DELEGATION_KEY_REFRESH_MS = 10 * 60 * 1000;
// SAS start times are checked against Azure's clock, so backdate them to tolerate skew
const SAS_CLOCK_SKEW_MS = 5 * 60 * 1000;

const DELEGATION_KEY_CACHE_MAX_ENTRIES = 200;
const delegationKeyCache = new Map<string, { key: Promise<UserDelegationKey>; expiresAt: number }>();

export const resolveAzureBlobRecordingAccess = (
  appConnection: TAppConnection
): Pick<TPamRecordingResolvedConfig, "azure"> => {
  if (appConnection.app !== AppConnection.AzureBlobStorage) {
    throw new BadRequestError({ message: "Azure Blob Storage recordings need an Azure Blob Storage connection" });
  }

  const { accountName, serviceClient, sharedKeyCredential, cacheKey } = getAzureBlobStorageServiceClient(
    appConnection.method as AzureBlobStorageConnectionMethod,
    appConnection.credentials
  );

  const getUserDelegationKey = () => {
    const cached = delegationKeyCache.get(cacheKey);
    if (cached && cached.expiresAt - Date.now() > USER_DELEGATION_KEY_REFRESH_MS) return cached.key;

    const now = Date.now();
    const key = serviceClient
      .getUserDelegationKey(new Date(now - SAS_CLOCK_SKEW_MS), new Date(now + USER_DELEGATION_KEY_LIFETIME_MS))
      .catch((err: unknown) => {
        delegationKeyCache.delete(cacheKey);
        throw err;
      });
    if (delegationKeyCache.size >= DELEGATION_KEY_CACHE_MAX_ENTRIES) {
      const oldest = delegationKeyCache.keys().next().value;
      if (oldest) delegationKeyCache.delete(oldest);
    }
    delegationKeyCache.set(cacheKey, { key, expiresAt: now + USER_DELEGATION_KEY_LIFETIME_MS });
    return key;
  };

  return { azure: { accountName, serviceClient, sharedKeyCredential, getUserDelegationKey } };
};

const getAzureAccess = (config: TPamRecordingResolvedConfig): TPamRecordingAzureAccess & { container: string } => {
  if (!config.azure || !config.bucket) {
    throw new BadRequestError({ message: "Azure Blob Storage backend requires a container and an Azure connection" });
  }
  return { ...config.azure, container: config.bucket };
};

const toAzureBadRequest = (err: unknown, config: TPamRecordingResolvedConfig, action: string) => {
  const container = config.bucket;
  if (isAzureNetworkError(err)) {
    return new BadRequestError({
      message: `Could not reach storage account '${config.azure?.accountName}' while ${action}. Check the account name and that its firewall allows Infisical.`
    });
  }
  if (err instanceof RestError && err.statusCode === 403) {
    return new BadRequestError({
      message: config.azure?.sharedKeyCredential
        ? `Storage account '${config.azure.accountName}' denied ${action} in container '${container}'. Verify the account key and that the account's firewall allows Infisical.`
        : `Storage account '${config.azure?.accountName}' denied ${action} in container '${container}'. Assign the connection's app registration the Storage Blob Data Contributor role on the storage account, and check that its firewall allows Infisical.`
    });
  }
  return new BadRequestError({
    message: `Azure Blob Storage failed ${action} in container '${container}': ${describeAzureStorageError(err)}`
  });
};

const mintBlobSasUrl = async (
  config: TPamRecordingResolvedConfig,
  objectKey: string,
  permissions: "cw" | "r"
): Promise<string> => {
  const { accountName, serviceClient, sharedKeyCredential, getUserDelegationKey, container } = getAzureAccess(config);
  const now = Date.now();
  const values = {
    containerName: container,
    blobName: objectKey,
    permissions: BlobSASPermissions.parse(permissions),
    protocol: SASProtocol.Https,
    startsOn: new Date(now - SAS_CLOCK_SKEW_MS),
    expiresOn: new Date(now + PAM_RECORDING_PRESIGNED_URL_EXPIRY_SECONDS * 1000)
  };

  let sas;
  try {
    sas = sharedKeyCredential
      ? generateBlobSASQueryParameters(values, sharedKeyCredential)
      : generateBlobSASQueryParameters(values, await getUserDelegationKey(), accountName);
  } catch (err) {
    logger.warn({ err, container }, `Azure SAS signing failed [container=${container}]`);
    throw toAzureBadRequest(err, config, "signing a link to a recording");
  }

  const blobUrl = serviceClient.getContainerClient(container).getBlobClient(objectKey).url;
  return `${blobUrl}?${sas.toString()}`;
};

export const AzureBlobRecordingStorageProvider: TPamRecordingStorageProvider = () => ({
  validateConfig: async ({ config }) => {
    const { serviceClient, container } = getAzureAccess(config);
    const containerClient = serviceClient.getContainerClient(container);

    let exists: boolean;
    try {
      exists = await containerClient.exists();
    } catch (err) {
      logger.warn({ err, container }, `Azure container check failed [container=${container}]`);
      throw toAzureBadRequest(err, config, "reading the container");
    }
    if (!exists) {
      throw new BadRequestError({
        message: `Container '${container}' does not exist in storage account '${config.azure?.accountName}'`
      });
    }

    // Written through a SAS link like the gateway's uploads, so a key prefix Azure can't sign for fails here
    const testKey = `${normalizeKeyPrefix(config.keyPrefix)}.test/${crypto.nativeCrypto.randomUUID()}`;
    const body = Buffer.from("infisical-pam-recording-config-test");
    try {
      await new BlockBlobClient(await mintBlobSasUrl(config, testKey, "cw")).upload(body, body.length);
    } catch (err) {
      logger.warn({ err, container, testKey }, `Azure test blob upload failed [container=${container}]`);
      if (err instanceof BadRequestError) throw err;
      throw toAzureBadRequest(err, config, "writing a test blob");
    }

    try {
      await containerClient.getBlobClient(testKey).delete();
    } catch (err) {
      logger.warn({ err, container, testKey }, `Azure test blob cleanup failed [testKey=${testKey}]`);
    }
  },

  mintPresignedPut: async ({ config, projectId, sessionId, chunkIndex, ciphertextBytes, isKeyframe }) => {
    if (ciphertextBytes <= 0 || ciphertextBytes > PAM_RECORDING_MAX_CHUNK_BYTES) {
      throw new BadRequestError({
        message: `Chunk size out of range [bytes=${ciphertextBytes}, max=${PAM_RECORDING_MAX_CHUNK_BYTES}]`
      });
    }

    const objectKey = buildExternalChunkObjectKey(
      config.keyPrefix,
      projectId,
      sessionId,
      chunkIndex,
      Boolean(isKeyframe)
    );

    return {
      url: await mintBlobSasUrl(config, objectKey, "cw"),
      objectKey,
      method: "PUT" as const,
      headers: { "x-ms-blob-type": "BlockBlob" },
      expiresInSeconds: PAM_RECORDING_PRESIGNED_URL_EXPIRY_SECONDS
    };
  },

  mintPresignedGet: async ({ config, objectKey }) => ({
    url: await mintBlobSasUrl(config, objectKey, "r"),
    expiresInSeconds: PAM_RECORDING_PRESIGNED_URL_EXPIRY_SECONDS
  }),

  // A SAS can't bind the upload size the way an S3 presigned PUT does, so check it after the fact.
  verifyUploadedObject: async ({ config, objectKey, ciphertextBytes }) => {
    const { serviceClient, container } = getAzureAccess(config);
    let contentLength: number | undefined;
    try {
      ({ contentLength } = await serviceClient.getContainerClient(container).getBlobClient(objectKey).getProperties());
    } catch (err) {
      if (err instanceof RestError && err.statusCode === 404) {
        throw new BadRequestError({ message: `Chunk object was not uploaded [objectKey=${objectKey}]` });
      }
      throw toAzureBadRequest(err, config, "reading the uploaded chunk");
    }
    if (contentLength !== ciphertextBytes) {
      throw new BadRequestError({
        message: `Uploaded chunk size does not match [declared=${ciphertextBytes}, actual=${contentLength ?? "unknown"}]`
      });
    }
  },

  deleteSession: async ({ config, projectId, sessionId }) => {
    const { serviceClient, container } = getAzureAccess(config);
    const containerClient = serviceClient.getContainerClient(container);
    const prefix = `${normalizeKeyPrefix(config.keyPrefix)}${projectId}/${sessionId}/`;

    for await (const page of containerClient.listBlobsFlat({ prefix }).byPage({ maxPageSize: 50 })) {
      await Promise.all(
        page.segment.blobItems.map((blob) => containerClient.getBlobClient(blob.name).deleteIfExists())
      );
    }
  }
});
