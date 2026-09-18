import {
  TRotationFactory,
  TRotationFactoryCheckActiveCredentials,
  TRotationFactoryGetSecretsPayload,
  TRotationFactoryIssueCredentials,
  TRotationFactoryRevokeCredentials,
  TRotationFactoryRotateCredentials
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import {
  getStripeErrorMessage,
  getStripeErrorStatus,
  getStripeMerchantRequestConfig,
  getStripePlatformRequestConfig,
  STRIPE_API_KEYS_URL,
  throwStripeApiKeyManagementError,
  withIdempotencyKey
} from "@app/services/app-connection/stripe/stripe-connection-public-client";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";

import { generateStripeEncryptionKeyPair, readStripeSecret } from "./stripe-api-key-jwe";
import {
  TStripeApiKeyCreateResponse,
  TStripeApiKeyRotationGeneratedCredentials,
  TStripeApiKeyRotationWithConnection
} from "./stripe-api-key-rotation-types";

const STRIPE_KEY_NAME_MAX_LENGTH = 100;

const getErrorMessage = (error: unknown): string => (error instanceof Error ? error.message : "Unknown error");

export const stripeApiKeyRotationFactory: TRotationFactory<
  TStripeApiKeyRotationWithConnection,
  TStripeApiKeyRotationGeneratedCredentials
> = (secretRotation) => {
  const {
    connection,
    parameters: { permissions, connectPermissions },
    secretsMapping
  } = secretRotation;

  const { accountId } = connection.credentials;

  // The factory is built without an id at create time, so the name comes from the mapped secret.
  // It is what makes a key stranded by a timed-out create identifiable in the Stripe dashboard.
  const $keyName = () => `infisical-${secretsMapping.apiKey}-${Date.now()}`.slice(0, STRIPE_KEY_NAME_MAX_LENGTH);

  const $createApiKey = async () => {
    const { publicKey, privateKey } = await generateStripeEncryptionKeyPair();

    let data: TStripeApiKeyCreateResponse;

    try {
      ({ data } = await request.post<TStripeApiKeyCreateResponse>(
        STRIPE_API_KEYS_URL,
        {
          type: "secret_key",
          name: $keyName(),
          permissions,
          ...(connectPermissions?.length ? { connect_permissions: connectPermissions } : {}),
          public_key: { pem_key: { data: publicKey, algorithm: "RSA" } }
        },
        withIdempotencyKey(getStripePlatformRequestConfig(accountId))
      ));
    } catch (error) {
      return throwStripeApiKeyManagementError(accountId, error);
    }

    if (!data?.id) {
      throw new BadRequestError({ message: "Stripe did not return an ID for the created API key." });
    }

    return { keyId: data.id, apiKey: readStripeSecret(data.secret_key, privateKey) };
  };

  /**
   * Expire is the whole retirement. Stripe decides when it takes effect, so nothing here claims the
   * key is dead. Narrowing the key's permissions first would stop it sooner, and was measured
   * working, but is deliberately not in v1. See the design doc.
   */
  const $retireKey = async (keyId: string) => {
    try {
      await request.post(
        `${STRIPE_API_KEYS_URL}/${keyId}/expire`,
        {},
        withIdempotencyKey(getStripePlatformRequestConfig(accountId))
      );
    } catch (error) {
      if (getStripeErrorStatus(error) === 404) return;

      throwStripeApiKeyManagementError(accountId, error);
    }
  };

  /** A key exists in Stripe before the row does, so a failed commit has to take the key with it. */
  const $commitOrCleanUp = async <T>(
    credentials: { keyId: string; apiKey: string },
    callback: (credentials: { keyId: string; apiKey: string }) => Promise<T>
  ): Promise<T> => {
    try {
      return await callback(credentials);
    } catch (commitError) {
      try {
        await $retireKey(credentials.keyId);
      } catch (cleanupError) {
        throw new BadRequestError({
          message: `${getErrorMessage(commitError)} The newly created Stripe API key ${credentials.keyId} could not be expired and may need to be removed manually: ${getErrorMessage(cleanupError)}`
        });
      }

      throw commitError;
    }
  };

  const issueCredentials: TRotationFactoryIssueCredentials<TStripeApiKeyRotationGeneratedCredentials> = async (
    callback
  ) => {
    const credentials = await $createApiKey();

    return $commitOrCleanUp(credentials, callback);
  };

  const revokeCredentials: TRotationFactoryRevokeCredentials<TStripeApiKeyRotationGeneratedCredentials> = async (
    credentials,
    callback
  ) => {
    if (!credentials?.length) return callback();

    for (const { keyId } of credentials) {
      // eslint-disable-next-line no-await-in-loop
      await $retireKey(keyId);
    }

    return callback();
  };

  const rotateCredentials: TRotationFactoryRotateCredentials<TStripeApiKeyRotationGeneratedCredentials> = async (
    credentialsToRevoke,
    callback
  ) => {
    const newCredentials = await $createApiKey();

    // Retire before committing, so a failure leaves Postgres and Stripe agreeing with each other and
    // the key we just minted gets cleaned up rather than orphaned across BullMQ's retries.
    if (credentialsToRevoke?.keyId) {
      try {
        await $retireKey(credentialsToRevoke.keyId);
      } catch (retireError) {
        try {
          await $retireKey(newCredentials.keyId);
        } catch (cleanupError) {
          throw new BadRequestError({
            message: `${getErrorMessage(retireError)} The newly created Stripe API key ${newCredentials.keyId} could not be expired and may need to be removed manually: ${getErrorMessage(cleanupError)}`
          });
        }

        throw retireError;
      }
    }

    return $commitOrCleanUp(newCredentials, callback);
  };

  const getSecretsPayload: TRotationFactoryGetSecretsPayload<TStripeApiKeyRotationGeneratedCredentials> = ({
    apiKey
  }) => [{ key: secretsMapping.apiKey, value: apiKey }];

  const checkActiveCredentials: TRotationFactoryCheckActiveCredentials<
    TStripeApiKeyRotationGeneratedCredentials
  > = async ({ apiKey }) => {
    try {
      await request.get(
        `${IntegrationUrls.STRIPE_API_URL}/v1/customers?limit=1`,
        getStripeMerchantRequestConfig(apiKey)
      );
    } catch (error) {
      // 403 means the key authenticated and simply lacks customer_read, which is a healthy narrow
      // key. Only 401 means the key is gone.
      if (getStripeErrorStatus(error) === 403) return;

      throw new BadRequestError({
        message: `Stripe API key verification failed: ${getStripeErrorMessage(error)}`
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
