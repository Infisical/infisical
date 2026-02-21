/* eslint-disable no-await-in-loop */
import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { AzureKeyVaultConnectionMethod } from "@app/services/app-connection/azure-key-vault/azure-key-vault-connection-enums";

import {
  TCredentialRotationCreateCredential,
  TCredentialRotationIssueInitialCredentials,
  TCredentialRotationMergeCredentials,
  TCredentialRotationProviderFactory,
  TCredentialRotationRevokeCredential,
  TCredentialRotationValidateMethod
} from "../../app-connection-credential-rotation-types";
import {
  AzureAddPasswordResponse,
  AzureErrorResponse,
  TAzureClientSecretCredentialRotationCredentials,
  TAzureClientSecretGeneratedCredential,
  TAzureClientSecretStrategyConfig,
  TCreateAzureClientSecretDTO
} from "./azure-client-secret-credential-rotation-types";

const sleep = async (ms: number) => {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
};

const GRAPH_API_BASE = "https://graph.microsoft.com/v1.0";
const EXPIRY_PADDING_IN_DAYS = 3;
const GRAPH_TOKEN_MAX_RETRIES = 3;
const GRAPH_TOKEN_BASE_RETRY_DELAY_MS = 2000;

// might be thrown if its a newly created client secret and it hasn't propagated yet.
// we need to retry in this case to give it some time
const isInvalidClientSecretError = (error: unknown): boolean => {
  if (!(error instanceof AxiosError)) return false;
  const desc = (error.response?.data as { error_description?: string })?.error_description || "";
  return desc.includes("AADSTS7000215");
};

const getGraphApiToken = async (
  credentials: {
    clientId: string;
    clientSecret: string;
    tenantId: string;
  },
  attempt = 0
): Promise<string> => {
  const { clientId, clientSecret, tenantId } = credentials;

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

  try {
    const { data } = await request.post<{ access_token: string }>(
      tokenUrl,
      new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
        scope: "https://graph.microsoft.com/.default"
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }
    );

    return data.access_token;
  } catch (error: unknown) {
    // Retry on AADSTS7000215 (invalid client secret) — this can happen when a newly created
    // secret hasn't propagated in Azure AD yet.
    if (isInvalidClientSecretError(error) && attempt < GRAPH_TOKEN_MAX_RETRIES) {
      const delay = GRAPH_TOKEN_BASE_RETRY_DELAY_MS * 2 ** attempt;
      logger.info(
        `credentialRotation: Graph API token auth failed (secret not propagated?), retrying in ${delay}ms (attempt ${attempt + 1}/${GRAPH_TOKEN_MAX_RETRIES})`
      );
      await sleep(delay);
      return getGraphApiToken(credentials, attempt + 1);
    }

    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to obtain Graph API token for self-rotation: ${
          (error.response?.data as { error_description?: string })?.error_description ||
          error?.message ||
          "Unknown error"
        }`
      });
    }
    throw new BadRequestError({
      message: "Failed to obtain Graph API token for self-rotation"
    });
  }
};

const parseAzureError = (error: unknown, context: string): never => {
  if (error instanceof AxiosError) {
    let message: string | undefined;
    if (
      error.response?.data &&
      typeof error.response.data === "object" &&
      "error" in error.response.data &&
      typeof (error.response.data as AzureErrorResponse).error.message === "string"
    ) {
      message = (error.response.data as AzureErrorResponse).error.message;
    }
    throw new BadRequestError({
      message: `${context}: ${message || error.message || "Unknown error"}`
    });
  }
  throw new BadRequestError({
    message: `${context}: Unable to validate connection`
  });
};

/**
 * Looks up the Azure AD application object ID from a client ID
 */
const getApplicationObjectId = async (
  credentials: Pick<TAzureClientSecretCredentialRotationCredentials, "clientId">,
  accessToken: string
): Promise<string> => {
  const endpoint = `${GRAPH_API_BASE}/applications?$filter=appId eq '${credentials.clientId}'&$select=id`;

  try {
    const { data } = await request.get<{ value: Array<{ id: string }> }>(endpoint, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      }
    });

    if (!data.value?.length) {
      throw new BadRequestError({
        message: `Could not find Azure AD application for clientId ${credentials.clientId}. Ensure the app registration has Application.ReadWrite.OwnedBy permission.`
      });
    }

    return data.value[0].id;
  } catch (error: unknown) {
    if (error instanceof BadRequestError) throw error;
    parseAzureError(error, `Failed to look up Azure AD application object ID for clientId ${credentials.clientId}`);

    throw error; // unreachable, parseAzureError always throws
  }
};

// Validates the strategy config by checking the app's objectId is accessible via Graph API.
const validateAzureClientSecretRotationConfig = async (
  config: TAzureClientSecretStrategyConfig,
  credentials: { clientId: string; clientSecret: string; tenantId: string },
  accessToken: string
) => {
  const endpoint = `${GRAPH_API_BASE}/applications/${config.objectId}`;

  try {
    await request.get(endpoint, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      }
    });
  } catch (error: unknown) {
    parseAzureError(error, `Failed to access Azure AD application ${config.objectId}`);
  }
};

const AZURE_CONCURRENT_REQUEST_MAX_RETRIES = 3;
const AZURE_CONCURRENT_REQUEST_BASE_DELAY_MS = 2000;

const isAzureConcurrentRequestError = (error: unknown): boolean => {
  if (!(error instanceof AxiosError)) return false;
  const message = (error.response?.data as AzureErrorResponse)?.error?.message || error.message || "";
  return message.includes("concurrent requests");
};

/**
 * Creates a new client secret on the Azure AD application.
 * Retries on Azure's transient "concurrent requests" error with exponential backoff.
 */
export const createAzureClientSecret = async (
  dto: TCreateAzureClientSecretDTO
): Promise<TAzureClientSecretGeneratedCredential> => {
  const { connectionName, config, accessToken, rotationInterval, activeIndex } = dto;
  const attempt = dto.attempt ?? 0;

  const endpoint = `${GRAPH_API_BASE}/applications/${config.objectId}/addPassword`;

  const now = new Date();
  const formattedDate = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(
    2,
    "0"
  )}-${now.getFullYear()}`;

  const endDateTime = new Date();
  endDateTime.setDate(now.getDate() + rotationInterval * 2 + EXPIRY_PADDING_IN_DAYS);

  try {
    const { data } = await request.post<AzureAddPasswordResponse>(
      endpoint,
      {
        passwordCredential: {
          displayName: `Infisical Managed Credential (${formattedDate}) [${activeIndex + 1}] - ${connectionName}`,
          endDateTime: endDateTime.toISOString()
        }
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        }
      }
    );

    if (!data?.secretText || !data?.keyId) {
      throw new BadRequestError({
        message: "Invalid response from Azure: missing secretText or keyId."
      });
    }

    return {
      keyId: data.keyId,
      clientSecret: data.secretText,
      createdAt: now.toISOString()
    };
  } catch (error: unknown) {
    if (isAzureConcurrentRequestError(error) && attempt < AZURE_CONCURRENT_REQUEST_MAX_RETRIES) {
      const delay = AZURE_CONCURRENT_REQUEST_BASE_DELAY_MS * 2 ** attempt;
      logger.info(
        `credentialRotation: Azure concurrent request error, retrying in ${delay}ms (attempt ${attempt + 1}/${AZURE_CONCURRENT_REQUEST_MAX_RETRIES})`
      );
      await sleep(delay);
      return createAzureClientSecret({ ...dto, attempt: attempt + 1 });
    }

    if (error instanceof BadRequestError) throw error;
    parseAzureError(error, `Failed to create client secret on Azure AD app ${config.objectId}`);

    throw new BadRequestError({
      message: `Failed to create client secret on Azure AD app ${config.objectId}: ${(error as Error)?.message || "Unknown error"}`
    });
  }
};

/**
 * Lists all password credentials on the Azure AD application.
 */
export const listAzurePasswordCredentials = async (
  config: TAzureClientSecretStrategyConfig,
  credentials: { clientId: string; clientSecret: string; tenantId: string },
  accessToken: string
): Promise<Array<{ keyId: string; displayName: string }>> => {
  const endpoint = `${GRAPH_API_BASE}/applications/${config.objectId}?$select=passwordCredentials`;

  try {
    const { data } = await request.get<{ passwordCredentials: Array<{ keyId: string; displayName: string }> }>(
      endpoint,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        }
      }
    );

    return data.passwordCredentials || [];
  } catch (error: unknown) {
    logger.warn(error, `Failed to list password credentials on app ${config.objectId}`);
    return [];
  }
};

/**
 * Checks if a credential with the given keyId exists on the Azure AD application.
 */
export const azureCredentialExists = async (
  keyId: string,
  config: TAzureClientSecretStrategyConfig,
  credentials: TAzureClientSecretCredentialRotationCredentials,
  accessToken: string
): Promise<boolean> => {
  const passwordCredentials = await listAzurePasswordCredentials(config, credentials, accessToken);
  return passwordCredentials.some((credential) => credential.keyId === keyId);
};

/**
 * Revokes a client secret from the Azure AD application.
 * Retries on Azure's transient "concurrent requests" error with exponential backoff.
 */
export const revokeAzureClientSecret = async (
  keyId: string,
  config: TAzureClientSecretStrategyConfig,
  credentials: { clientId: string; clientSecret: string; tenantId: string },
  accessToken: string,
  attempt = 0
): Promise<void> => {
  const exists = await azureCredentialExists(keyId, config, credentials, accessToken);
  if (!exists) {
    logger.info(`Credential keyId=${keyId} does not exist on app ${config.objectId}, skipping revocation`);
    return;
  }

  const endpoint = `${GRAPH_API_BASE}/applications/${config.objectId}/removePassword`;

  try {
    await request.post(
      endpoint,
      { keyId },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        }
      }
    );
  } catch (error: unknown) {
    if (isAzureConcurrentRequestError(error) && attempt < AZURE_CONCURRENT_REQUEST_MAX_RETRIES) {
      const delay = AZURE_CONCURRENT_REQUEST_BASE_DELAY_MS * 2 ** attempt;
      logger.info(
        `credentialRotation: Azure concurrent request error on revoke, retrying in ${delay}ms (attempt ${attempt + 1}/${AZURE_CONCURRENT_REQUEST_MAX_RETRIES})`
      );
      await sleep(delay);
      await revokeAzureClientSecret(keyId, config, credentials, accessToken, attempt + 1);
      return;
    }

    parseAzureError(error, `Failed to revoke client secret keyId=${keyId} from app ${config.objectId}`);
  }
};

export const azureClientSecretRotationProviderFactory: TCredentialRotationProviderFactory<
  TAzureClientSecretStrategyConfig,
  TAzureClientSecretGeneratedCredential
> = (connection) => {
  const validateConnectionMethod: TCredentialRotationValidateMethod = (method) => {
    if (method !== AzureKeyVaultConnectionMethod.ClientSecret) {
      throw new BadRequestError({
        message: "Credential rotation is only supported for Client Secret auth method"
      });
    }
  };

  const issueInitialCredentials: TCredentialRotationIssueInitialCredentials<
    TAzureClientSecretStrategyConfig,
    TAzureClientSecretGeneratedCredential
  > = async (credentials, rotationInterval) => {
    const azureCredentials = credentials as {
      clientId: string;
      clientSecret: string;
      tenantId: string;
      applicationObjectId?: string;
    };

    const accessToken = await getGraphApiToken(azureCredentials);

    let { applicationObjectId } = azureCredentials;
    if (!applicationObjectId) {
      applicationObjectId = await getApplicationObjectId(azureCredentials, accessToken);
    }

    const strategyConfig: TAzureClientSecretStrategyConfig = { objectId: applicationObjectId };
    await validateAzureClientSecretRotationConfig(strategyConfig, azureCredentials, accessToken);

    // Create one Infisical-managed credential. The second slot starts empty (null) and will
    // be filled on the first rotation cycle. The original user-provided secret becomes unused
    // but can't be revoked because Azure doesn't expose which keyId maps to a given secret value.
    // It will expire naturally based on its configured expiry in Azure AD.
    const newCredential = await createAzureClientSecret({
      accessToken,
      connectionName: connection.name,
      config: strategyConfig,
      rotationInterval,
      activeIndex: 0,
      attempt: 0
    });

    const generatedCredentials: (TAzureClientSecretGeneratedCredential | null)[] = [newCredential, null];

    return {
      strategyConfig,
      generatedCredentials,
      updatedCredentials: { ...azureCredentials, clientSecret: newCredential.clientSecret, applicationObjectId }
    };
  };

  const createCredential: TCredentialRotationCreateCredential<
    TAzureClientSecretStrategyConfig,
    TAzureClientSecretGeneratedCredential
  > = async (strategyConfig, credentials, rotationInterval, activeIndex) => {
    const accessToken = await getGraphApiToken(credentials);

    return createAzureClientSecret({
      accessToken,
      activeIndex,
      config: strategyConfig,
      connectionName: connection.name,
      rotationInterval
    });
  };

  const mergeCredentials: TCredentialRotationMergeCredentials<TAzureClientSecretGeneratedCredential> = (
    currentCredentials,
    newCredential
  ) => {
    return { ...currentCredentials, clientSecret: newCredential.clientSecret };
  };

  const revokeCredential: TCredentialRotationRevokeCredential<
    TAzureClientSecretStrategyConfig,
    TAzureClientSecretGeneratedCredential
  > = async (inactiveCredential, strategyConfig, credentials) => {
    if (!inactiveCredential?.keyId) return;

    const accessToken = await getGraphApiToken(credentials);

    await revokeAzureClientSecret(inactiveCredential.keyId, strategyConfig, credentials, accessToken);
  };

  return {
    validateConnectionMethod,
    issueInitialCredentials,
    createCredential,
    mergeCredentials,
    revokeCredential
  };
};
