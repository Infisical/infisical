import { BlobServiceClient, RestError, StorageSharedKeyCredential } from "@azure/storage-blob";
import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";

import { AppConnection } from "../app-connection-enums";
import { AzureBlobStorageConnectionMethod } from "./azure-blob-storage-connection-enums";
import { TAzureBlobStorageConnectionConfig } from "./azure-blob-storage-connection-types";

type TAzureAccessToken = { token: string; expiresOnTimestamp: number };

const AZURE_STORAGE_SCOPE = "https://storage.azure.com/.default";
const DELEGATION_KEY_PROBE_MS = 5 * 60 * 1000;
const CLIENT_CACHE_MAX_ENTRIES = 200;
// One retry and a short per-try timeout, so a misspelled account name fails in seconds instead of minutes
const AZURE_RETRY_OPTIONS = { maxTries: 2, tryTimeoutInMs: 15_000 };

type TAzureBlobStorageCredentials = TAzureBlobStorageConnectionConfig["credentials"];

export const getAzureBlobStorageConnectionListItem = () => {
  return {
    name: "Azure Blob Storage" as const,
    app: AppConnection.AzureBlobStorage as const,
    methods: Object.values(AzureBlobStorageConnectionMethod) as [
      AzureBlobStorageConnectionMethod.ClientSecret,
      AzureBlobStorageConnectionMethod.AccessKey
    ]
  };
};

export const getAzureBlobStorageAccountUrl = (accountName: string) => `https://${accountName}.blob.core.windows.net`;

const createClientSecretTokenCredential = ({
  tenantId,
  clientId,
  clientSecret
}: {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}) => {
  let cached: TAzureAccessToken | null = null;
  return {
    getToken: async (): Promise<TAzureAccessToken> => {
      if (cached && cached.expiresOnTimestamp > Date.now() + 60_000) return cached;
      const { data } = await request.post<{ access_token: string; expires_in: number }>(
        IntegrationUrls.AZURE_TOKEN_URL.replace("common", tenantId),
        new URLSearchParams({
          grant_type: "client_credentials",
          scope: AZURE_STORAGE_SCOPE,
          client_id: clientId,
          client_secret: clientSecret
        })
      );
      cached = { token: data.access_token, expiresOnTimestamp: Date.now() + data.expires_in * 1000 };
      return cached;
    }
  };
};

type TAzureBlobStorageServiceClient = {
  accountName: string;
  serviceClient: BlobServiceClient;
  sharedKeyCredential: StorageSharedKeyCredential | null;
  cacheKey: string;
};

// Clients are reused across requests so the Entra token cached inside them survives between chunk uploads
const clientCache = new Map<string, TAzureBlobStorageServiceClient>();

export const getAzureBlobStorageServiceClient = (
  method: AzureBlobStorageConnectionMethod,
  credentials: unknown
): TAzureBlobStorageServiceClient => {
  const creds = credentials as TAzureBlobStorageCredentials;
  const cacheKey = crypto.nativeCrypto
    .createHash("sha256")
    .update(JSON.stringify([method, creds]))
    .digest("hex");
  const cached = clientCache.get(cacheKey);
  if (cached) return cached;

  const url = getAzureBlobStorageAccountUrl(creds.accountName);
  let client: TAzureBlobStorageServiceClient;
  if (method === AzureBlobStorageConnectionMethod.AccessKey) {
    const { accountName, accountKey } = creds as { accountName: string; accountKey: string };
    const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);
    client = {
      accountName,
      serviceClient: new BlobServiceClient(url, sharedKeyCredential, { retryOptions: AZURE_RETRY_OPTIONS }),
      sharedKeyCredential,
      cacheKey
    };
  } else {
    const { accountName, tenantId, clientId, clientSecret } = creds as {
      accountName: string;
      tenantId: string;
      clientId: string;
      clientSecret: string;
    };
    client = {
      accountName,
      serviceClient: new BlobServiceClient(
        url,
        createClientSecretTokenCredential({ tenantId, clientId, clientSecret }),
        {
          retryOptions: AZURE_RETRY_OPTIONS
        }
      ),
      sharedKeyCredential: null,
      cacheKey
    };
  }

  if (clientCache.size >= CLIENT_CACHE_MAX_ENTRIES) {
    const oldest = clientCache.keys().next().value;
    if (oldest) clientCache.delete(oldest);
  }
  clientCache.set(cacheKey, client);
  return client;
};

export const isAzureNetworkError = (error: unknown) =>
  (error instanceof RestError && !error.statusCode) || (error instanceof AxiosError && !error.response);

export const describeAzureStorageError = (error: unknown) => {
  if (isAzureNetworkError(error)) return "the service could not be reached";
  if (error instanceof RestError) {
    return error.code ? `${error.code} (HTTP ${error.statusCode})` : `HTTP ${error.statusCode}`;
  }
  if (error instanceof AxiosError) {
    const data = error.response?.data as { error_description?: string } | undefined;
    return data?.error_description?.split("\r\n")[0] ?? error.message;
  }
  return (error as Error)?.message ?? "unknown error";
};

export const validateAzureBlobStorageConnectionCredentials = async (config: TAzureBlobStorageConnectionConfig) => {
  const { serviceClient, accountName } = getAzureBlobStorageServiceClient(config.method, config.credentials);

  try {
    if (config.method === AzureBlobStorageConnectionMethod.ClientSecret) {
      const now = new Date();
      await serviceClient.getUserDelegationKey(now, new Date(now.getTime() + DELEGATION_KEY_PROBE_MS));
    } else {
      await serviceClient.getAccountInfo();
    }
  } catch (error) {
    logger.warn(
      { err: error },
      `Azure Blob Storage credential check failed [orgId=${config.orgId}] [accountName=${accountName}]`
    );

    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: error.response
          ? `Microsoft Entra ID rejected the client credentials: ${describeAzureStorageError(error)}`
          : "Could not reach Microsoft Entra ID to sign in with the client credentials. Try again later."
      });
    }

    if (error instanceof RestError && error.statusCode === 403) {
      throw new BadRequestError({
        message:
          config.method === AzureBlobStorageConnectionMethod.ClientSecret
            ? `The app registration can't access storage account '${accountName}'. Assign it the Storage Blob Data Contributor role on the account, and check that the account's firewall allows Infisical.`
            : `Storage account '${accountName}' rejected the request. Verify the account key, that shared key access is allowed on the account, and that its firewall allows Infisical.`
      });
    }

    if (error instanceof RestError && error.statusCode) {
      throw new BadRequestError({
        message: `Storage account '${accountName}' returned ${describeAzureStorageError(error)}`
      });
    }

    throw new BadRequestError({
      message: `Could not reach storage account '${accountName}'. Verify the account name and try again.`
    });
  }

  return config.credentials;
};
