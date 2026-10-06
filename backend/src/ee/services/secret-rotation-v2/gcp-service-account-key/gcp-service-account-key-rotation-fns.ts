import { AxiosError } from "axios";
import { JWT } from "google-auth-library";

import {
  TRotationFactory,
  TRotationFactoryCheckActiveCredentials,
  TRotationFactoryGetSecretsPayload,
  TRotationFactoryIssueCredentials,
  TRotationFactoryRevokeCredentials,
  TRotationFactoryRotateCredentials
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { request } from "@app/lib/config/request";
import { delay } from "@app/lib/delay";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { getGcpConnectionAuthToken } from "@app/services/app-connection/gcp";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";

import {
  TGcpServiceAccountKeyCreateResponse,
  TGcpServiceAccountKeyFile,
  TGcpServiceAccountKeyRotationGeneratedCredentials,
  TGcpServiceAccountKeyRotationWithConnection
} from "./gcp-service-account-key-rotation-types";

// GCP documents that a new key can take 60 seconds or more before it is accepted, but the rotation
// holds a 60 second lock, so polling stops well short of that and the attempt fails instead.
const KEY_VERIFICATION_MAX_ATTEMPTS = 12;
const KEY_VERIFICATION_INTERVAL_MS = 3000;

type TGoogleApiError = {
  error?: { status?: string; message?: string };
};

const getGoogleApiError = (error: unknown) =>
  error instanceof AxiosError ? (error.response?.data as TGoogleApiError | undefined)?.error : undefined;

const getErrorMessage = (error: unknown): string => {
  if (error instanceof AxiosError) return getGoogleApiError(error)?.message ?? error.message;

  return error instanceof Error ? error.message : "Unknown error";
};

const getErrorStatus = (error: unknown) => (error instanceof AxiosError ? error.response?.status : undefined);

export const gcpServiceAccountKeyRotationFactory: TRotationFactory<
  TGcpServiceAccountKeyRotationWithConnection,
  TGcpServiceAccountKeyRotationGeneratedCredentials
> = (secretRotation) => {
  const {
    connection,
    parameters: { serviceAccountEmail },
    secretsMapping
  } = secretRotation;

  const keysUrl = `${IntegrationUrls.GCP_IAM_URL}/v1/projects/-/serviceAccounts/${encodeURIComponent(serviceAccountEmail)}/keys`;

  const $getRequestConfig = (accessToken: string) => ({
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    }
  });

  const $toKeyManagementError = (error: unknown, action: string) => {
    const message = getErrorMessage(error);
    const status = getErrorStatus(error);

    if (status === 403) {
      if (message.includes("has not been used in project") || message.includes("is disabled")) {
        return new BadRequestError({
          message: `Failed to ${action}: the Identity and Access Management (IAM) API is not enabled on the GCP project of the connection's service account. Enable it in the Google Cloud console and try again.`
        });
      }

      return new BadRequestError({
        message: `Failed to ${action}: the connection's service account is not allowed to manage keys of GCP service account "${serviceAccountEmail}". Grant it the Service Account Key Admin role (roles/iam.serviceAccountKeyAdmin) on that service account and try again.`
      });
    }

    if (status === 404) {
      return new BadRequestError({
        message: `Failed to ${action}: GCP service account "${serviceAccountEmail}" was not found.`
      });
    }

    if (getGoogleApiError(error)?.status === "FAILED_PRECONDITION") {
      return new BadRequestError({
        message: `Failed to ${action}: ${message} This usually means GCP service account "${serviceAccountEmail}" already has the maximum of 10 keys, or an organization policy (iam.disableServiceAccountKeyCreation) blocks key creation.`
      });
    }

    return new BadRequestError({ message: `Failed to ${action}: ${message}` });
  };

  const $deleteKey = async (accessToken: string, keyId: string) => {
    try {
      await request.delete(`${keysUrl}/${encodeURIComponent(keyId)}`, $getRequestConfig(accessToken));
    } catch (error) {
      // The key is already gone, e.g. deleted by hand in the console or by an earlier attempt.
      if (getErrorStatus(error) === 404) return;

      throw $toKeyManagementError(error, `delete key "${keyId}" of GCP service account "${serviceAccountEmail}"`);
    }
  };

  /**
   * A key exists in GCP before the rotation row records it, so anything that fails after the key is
   * created has to delete it, or it is left behind untracked and counts toward GCP's 10 key limit.
   */
  const $deleteOnFailure = async <T>(accessToken: string, keyId: string, action: () => Promise<T>): Promise<T> => {
    try {
      return await action();
    } catch (actionError) {
      try {
        await $deleteKey(accessToken, keyId);
      } catch (cleanupError) {
        throw new BadRequestError({
          message: `${getErrorMessage(actionError)} The new key "${keyId}" could not be deleted and may need to be removed manually from GCP service account "${serviceAccountEmail}": ${getErrorMessage(cleanupError)}`
        });
      }

      throw actionError;
    }
  };

  const $authenticateWithKey = async (serviceAccountKey: string) => {
    let keyFile: TGcpServiceAccountKeyFile;

    try {
      keyFile = JSON.parse(serviceAccountKey) as TGcpServiceAccountKeyFile;
    } catch {
      // the parse error can quote part of the input, which here is the private key
      throw new BadRequestError({ message: "The service account key is not valid JSON." });
    }

    await new JWT({
      email: keyFile.client_email,
      key: keyFile.private_key,
      scopes: [IntegrationUrls.GCP_CLOUD_PLATFORM_SCOPE]
    }).authorize();
  };

  // Apps read the mapped secret as soon as it changes, so a scheduled rotation only publishes a key once GCP
  // accepts it. Rotations run from an HTTP request skip this, so the wait never holds a request open.
  const $waitUntilKeyAccepted = async (keyId: string, serviceAccountKey: string) => {
    let lastError: unknown;

    for (let attempt = 1; attempt <= KEY_VERIFICATION_MAX_ATTEMPTS; attempt += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await $authenticateWithKey(serviceAccountKey);

        if (attempt > 1) {
          logger.info(
            `secretRotation: GCP accepted new service account key [serviceAccountEmail=${serviceAccountEmail}] [keyId=${keyId}] [attempt=${attempt}]`
          );
        }

        return;
      } catch (error) {
        lastError = error;
      }

      // eslint-disable-next-line no-await-in-loop
      if (attempt < KEY_VERIFICATION_MAX_ATTEMPTS) await delay(KEY_VERIFICATION_INTERVAL_MS);
    }

    throw new BadRequestError({
      message: `GCP did not accept the new key "${keyId}" for service account "${serviceAccountEmail}" in time: ${getErrorMessage(lastError)}`
    });
  };

  const $createKey = async (accessToken: string, shouldWaitUntilAccepted: boolean) => {
    let data: TGcpServiceAccountKeyCreateResponse;

    try {
      ({ data } = await request.post<TGcpServiceAccountKeyCreateResponse>(keysUrl, {}, $getRequestConfig(accessToken)));
    } catch (error) {
      throw $toKeyManagementError(error, `create a key for GCP service account "${serviceAccountEmail}"`);
    }

    const keyId = data?.name?.split("/").pop();

    if (!keyId) {
      throw new BadRequestError({
        message: `GCP did not return an ID for the new key of service account "${serviceAccountEmail}".`
      });
    }

    return $deleteOnFailure(accessToken, keyId, async () => {
      if (!data.privateKeyData) {
        throw new BadRequestError({
          message: `GCP did not return the private key for the new key "${keyId}" of service account "${serviceAccountEmail}".`
        });
      }

      const serviceAccountKey = Buffer.from(data.privateKeyData, "base64").toString("utf8");

      if (shouldWaitUntilAccepted) await $waitUntilKeyAccepted(keyId, serviceAccountKey);

      return { keyId, serviceAccountKey };
    });
  };

  const issueCredentials: TRotationFactoryIssueCredentials<TGcpServiceAccountKeyRotationGeneratedCredentials> = async (
    callback
  ) => {
    const accessToken = await getGcpConnectionAuthToken(connection);

    // creating a rotation always runs inside an HTTP request
    const credentials = await $createKey(accessToken, false);

    return $deleteOnFailure(accessToken, credentials.keyId, () => callback(credentials));
  };

  const revokeCredentials: TRotationFactoryRevokeCredentials<
    TGcpServiceAccountKeyRotationGeneratedCredentials
  > = async (credentials, callback) => {
    if (!credentials?.length) return callback();

    const accessToken = await getGcpConnectionAuthToken(connection);

    // The key apps are using is deleted last, so a failure part way through leaves the rotation and its
    // secret in place with a key that still works, rather than one that is already gone.
    const { activeIndex } = secretRotation;
    const deletionOrder = [
      ...credentials.filter((_, index) => index !== activeIndex),
      ...credentials.filter((_, index) => index === activeIndex)
    ];

    for await (const { keyId } of deletionOrder) {
      await $deleteKey(accessToken, keyId);
    }

    return callback();
  };

  const rotateCredentials: TRotationFactoryRotateCredentials<
    TGcpServiceAccountKeyRotationGeneratedCredentials
  > = async (credentialsToRevoke, callback, _activeCredentials, options) => {
    const accessToken = await getGcpConnectionAuthToken(connection);

    const newCredentials = await $createKey(accessToken, Boolean(options?.isBackgroundJob));

    // Delete before committing, so a failure leaves GCP and the rotation agreeing with each other and the
    // new key is cleaned up rather than left untracked across retries.
    if (credentialsToRevoke?.keyId) {
      await $deleteOnFailure(accessToken, newCredentials.keyId, () =>
        $deleteKey(accessToken, credentialsToRevoke.keyId)
      );
    }

    return $deleteOnFailure(accessToken, newCredentials.keyId, () => callback(newCredentials));
  };

  const getSecretsPayload: TRotationFactoryGetSecretsPayload<TGcpServiceAccountKeyRotationGeneratedCredentials> = ({
    serviceAccountKey
  }) => [{ key: secretsMapping.serviceAccountKey, value: serviceAccountKey }];

  const checkActiveCredentials: TRotationFactoryCheckActiveCredentials<
    TGcpServiceAccountKeyRotationGeneratedCredentials
  > = async ({ keyId, serviceAccountKey }) => {
    try {
      await $authenticateWithKey(serviceAccountKey);
    } catch (error) {
      throw new BadRequestError({
        message: `GCP rejected key "${keyId}" of service account "${serviceAccountEmail}": ${getErrorMessage(error)}`
      });
    }
  };

  return {
    issueCredentials,
    revokeCredentials,
    rotateCredentials,
    getSecretsPayload,
    checkActiveCredentials
  };
};
