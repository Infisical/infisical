import { Knex } from "knex";
import { z } from "zod";

import { TKeyStoreFactory } from "@app/keystore/keystore";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { TQueueServiceFactory } from "@app/queue";
import { QueueJobs, QueueName } from "@app/queue/queue-service";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  decryptAppConnectionCredentials,
  encryptAppConnectionCredentials
} from "@app/services/app-connection/app-connection-fns";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import { TAppConnection } from "../app-connection-types";
import { AzureClientSecretsConnectionMethod } from "../azure-client-secrets";
import { AzureKeyVaultConnectionMethod } from "../azure-key-vault";
import { TAppConnectionCredentialRotationDALFactory } from "./app-connection-credential-rotation-dal";
import {
  AppConnectionCredentialRotationStatus,
  AppConnectionCredentialRotationStrategy
} from "./app-connection-credential-rotation-enums";
import {
  calculateNextRotationAt,
  decryptCredentialRotationGeneratedCredentials,
  decryptStrategyConfig,
  encryptCredentialRotationGeneratedCredentials,
  encryptRotationMessage,
  encryptStrategyConfig,
  expandCredentialRotation,
  parseRotationErrorMessage
} from "./app-connection-credential-rotation-fns";
import {
  TAppConnectionCredentialCredentials,
  TAppConnectionCredentialRotationStrategyConfig,
  TCreateAppConnectionCredentialRotationDTO,
  TCredentialRotationProviderFactory,
  TTriggerAppConnectionCredentialRotationDTO,
  TUpdateAppConnectionCredentialRotationDTO
} from "./app-connection-credential-rotation-types";
import {
  AzureClientSecretCredentialRotationCredentialsSchema,
  azureClientSecretRotationProviderFactory
} from "./providers/azure-client-secret";

const MAX_GENERATED_CREDENTIALS_LENGTH = 2;

const STRATEGY_MAP: Record<
  AppConnectionCredentialRotationStrategy,
  {
    app: TAppConnection["app"]; // azure-key-vault
    method: TAppConnection["method"]; // client-secret
  }[]
> = {
  [AppConnectionCredentialRotationStrategy.AzureClientSecret]: [
    {
      app: AppConnection.AzureKeyVault,
      method: AzureKeyVaultConnectionMethod.ClientSecret
    },
    {
      app: AppConnection.AzureClientSecrets,
      method: AzureClientSecretsConnectionMethod.ClientSecret
    }
  ]
};

const CREDENTIAL_ROTATION_CREDENTIALS_SCHEMA_MAP: Record<
  AppConnectionCredentialRotationStrategy,
  z.ZodSchema<TAppConnectionCredentialCredentials>
> = {
  [AppConnectionCredentialRotationStrategy.AzureClientSecret]: AzureClientSecretCredentialRotationCredentialsSchema
};

const CREDENTIAL_ROTATION_PROVIDER_FACTORY_MAP: Record<
  AppConnectionCredentialRotationStrategy,
  TCredentialRotationProviderFactory
> = {
  [AppConnectionCredentialRotationStrategy.AzureClientSecret]:
    azureClientSecretRotationProviderFactory as TCredentialRotationProviderFactory
};

export type TAppConnectionCredentialRotationServiceFactoryDep = {
  appConnectionCredentialRotationDAL: TAppConnectionCredentialRotationDALFactory;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById" | "updateById" | "transaction">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  keyStore: Pick<TKeyStoreFactory, "acquireLock" | "setItemWithExpiry" | "getItem">;
  queueService: TQueueServiceFactory;
};

export type TAppConnectionCredentialRotationServiceFactory = ReturnType<
  typeof appConnectionCredentialRotationServiceFactory
>;

export const appConnectionCredentialRotationServiceFactory = ({
  appConnectionCredentialRotationDAL,
  appConnectionDAL,
  kmsService,
  keyStore,
  queueService
}: TAppConnectionCredentialRotationServiceFactoryDep) => {
  /**
   * Decrypt connection credentials.
   */
  const getConnectionClientCredentials = async (connection: {
    orgId: string;
    encryptedCredentials: Buffer;
    projectId?: string | null;
  }): Promise<Record<string, unknown>> => {
    return decryptAppConnectionCredentials({
      orgId: connection.orgId,
      encryptedCredentials: connection.encryptedCredentials,
      kmsService,
      projectId: connection.projectId
    }) as Promise<Record<string, unknown>>;
  };

  /**
   * Update the connection's stored credentials.
   */
  const updateConnectionCredentials = async (
    connectionId: string,
    updatedCredentials: TAppConnection["credentials"],
    tx?: Knex
  ) => {
    const connection = await appConnectionDAL.findById(connectionId, tx);
    if (!connection) throw new NotFoundError({ message: `Connection ${connectionId} not found` });

    const encryptedCredentials = await encryptAppConnectionCredentials({
      orgId: connection.orgId,
      credentials: updatedCredentials,
      kmsService,
      projectId: connection.projectId
    });

    await appConnectionDAL.updateById(connectionId, { encryptedCredentials }, tx);
  };

  /**
   * Create credential rotation for a connection.
   * Permission checks are handled by the caller (app-connection-endpoints).
   */
  const createRotation = async (dto: TCreateAppConnectionCredentialRotationDTO, tx?: Knex) => {
    const { connectionId, rotationInterval, rotateAtUtc } = dto;

    const connection = await appConnectionDAL.findById(connectionId, tx);
    if (!connection) throw new NotFoundError({ message: `Connection ${connectionId} not found` });

    const strategy = Object.values(AppConnectionCredentialRotationStrategy).find((s) =>
      STRATEGY_MAP[s].some(({ app, method }) => app === connection.app && method === connection.method)
    );

    if (!strategy) {
      throw new BadRequestError({
        message: `Credential rotation is not supported for ${connection.app} connections with ${connection.method} method`
      });
    }

    const provider = CREDENTIAL_ROTATION_PROVIDER_FACTORY_MAP[strategy](connection);

    provider.validateConnectionMethod(connection.method);

    const existingRotation = await appConnectionCredentialRotationDAL.findByConnectionId(connectionId, tx);
    if (existingRotation) {
      throw new BadRequestError({ message: "Credential rotation is already configured for this connection" });
    }

    const credentials = await getConnectionClientCredentials(connection);

    const { strategyConfig, generatedCredentials, updatedCredentials } = await provider.issueInitialCredentials(
      credentials,
      rotationInterval
    );

    // Update the connection to use the new credential
    await updateConnectionCredentials(connectionId, updatedCredentials as TAppConnection["credentials"], tx);

    const now = new Date();

    const encryptedGeneratedCreds = await encryptCredentialRotationGeneratedCredentials({
      orgId: connection.orgId,
      generatedCredentials,
      kmsService
    });

    const encryptedConfig = await encryptStrategyConfig({
      orgId: connection.orgId,
      config: strategyConfig,
      kmsService
    });

    const nextRotationAt = calculateNextRotationAt({
      rotateAtUtc,
      isAutoRotationEnabled: true,
      rotationInterval,
      rotationStatus: AppConnectionCredentialRotationStatus.Success,
      isManualRotation: true,
      lastRotatedAt: now
    });

    const create = async (trx: Knex) => {
      return appConnectionCredentialRotationDAL.create(
        {
          connectionId,
          strategy,
          encryptedStrategyConfig: encryptedConfig,
          rotationInterval,
          rotateAtUtc: JSON.stringify(rotateAtUtc),
          rotationStatus: AppConnectionCredentialRotationStatus.Success,
          lastRotatedAt: now,
          lastRotationAttemptedAt: now,
          nextRotationAt,
          activeIndex: 0,
          encryptedGeneratedCredentials: encryptedGeneratedCreds
        },
        trx
      );
    };

    const rotation = tx ? await create(tx) : await appConnectionDAL.transaction(create);

    return expandCredentialRotation(rotation, connection.orgId, kmsService);
  };

  /**
   * Update credential rotation config for a connection.
   * Permission checks are handled by the caller.
   */
  const updateRotation = async (dto: TUpdateAppConnectionCredentialRotationDTO, tx?: Knex) => {
    const { connectionId, rotationInterval, rotateAtUtc, isAutoRotationEnabled } = dto;

    const connection = await appConnectionDAL.findById(connectionId, tx);
    if (!connection) throw new NotFoundError({ message: `Connection ${connectionId} not found` });

    const existingRotation = await appConnectionCredentialRotationDAL.findByConnectionId(connectionId, tx);
    if (!existingRotation) {
      throw new NotFoundError({ message: "Credential rotation is not configured for this connection" });
    }

    const update = async (trx: Knex) => {
      await appConnectionDAL.updateById(connectionId, { isAutoRotationEnabled: false }, trx);
      await appConnectionCredentialRotationDAL.deleteById(existingRotation.id, trx);

      return null;
    };

    // If disabling auto rotation, delete the rotation config
    if (isAutoRotationEnabled === false) {
      if (tx) {
        await update(tx);
      } else {
        await appConnectionDAL.transaction(update);
      }

      return null;
    }

    // Build update payload
    const updateData: Record<string, unknown> = {};

    if (rotationInterval !== undefined) {
      updateData.rotationInterval = rotationInterval;
    }

    if (rotateAtUtc !== undefined) {
      updateData.rotateAtUtc = JSON.stringify(rotateAtUtc);
    }

    // Recalculate nextRotationAt if schedule changed
    if (rotationInterval !== undefined || rotateAtUtc !== undefined) {
      const resolvedRotateAtUtc = rotateAtUtc || (existingRotation.rotateAtUtc as { hours: number; minutes: number });
      const resolvedInterval = rotationInterval ?? existingRotation.rotationInterval;

      if (existingRotation.lastRotatedAt) {
        updateData.nextRotationAt = calculateNextRotationAt({
          rotateAtUtc: resolvedRotateAtUtc,
          isAutoRotationEnabled: true,
          rotationInterval: resolvedInterval,
          rotationStatus: existingRotation.rotationStatus,
          isManualRotation: false,
          lastRotatedAt: existingRotation.lastRotatedAt
        });
      }
    }

    if (isAutoRotationEnabled !== undefined) {
      await appConnectionDAL.updateById(connectionId, { isAutoRotationEnabled }, tx);
    }

    const updated = await appConnectionCredentialRotationDAL.updateById(existingRotation.id, updateData, tx);
    return expandCredentialRotation(updated, connection.orgId, kmsService);
  };

  /**
   * Get credential rotation config for a connection.
   * Permission checks are handled by the caller.
   */
  const getRotationByConnectionId = async (connectionId: string, tx?: Knex) => {
    const connection = await appConnectionDAL.findById(connectionId, tx);
    if (!connection) throw new NotFoundError({ message: `Connection ${connectionId} not found` });

    const rotation = await appConnectionCredentialRotationDAL.findByConnectionId(connectionId, tx);
    if (!rotation) return null;

    return expandCredentialRotation(rotation, connection.orgId, kmsService);
  };

  /**
   * Trigger a manual credential rotation.
   * Permission checks are handled by the caller.
   */
  const triggerRotation = async (dto: TTriggerAppConnectionCredentialRotationDTO, tx?: Knex) => {
    const { connectionId } = dto;

    const connection = await appConnectionDAL.findById(connectionId, tx);
    if (!connection) throw new NotFoundError({ message: `Connection ${connectionId} not found` });

    const rotation = await appConnectionCredentialRotationDAL.findByConnectionId(connectionId, tx);
    if (!rotation) {
      throw new NotFoundError({ message: "Credential rotation is not configured for this connection" });
    }

    await queueService.queue(
      QueueName.AppConnectionCredentialRotationRotate,
      QueueJobs.AppConnectionCredentialRotationRotate,
      {
        rotationId: rotation.id,
        connectionId,
        queuedAt: new Date(),
        isManualRotation: true
      },
      {
        jobId: `app-connection-credential-rotation-manual-${rotation.id}-${Date.now()}`,
        removeOnFail: true,
        removeOnComplete: true
      }
    );

    return expandCredentialRotation(rotation, connection.orgId, kmsService);
  };

  /**
   * Core rotation logic. called by the queue worker
   * twoo credential self-rotation pattern
   */
  const rotateCredentials = async (
    rotationId: string,
    options: {
      jobId: string;
      shouldSendNotification: boolean;
      isFinalAttempt: boolean;
      isManualRotation?: boolean;
    }
  ) => {
    const rotationWithConnection = await appConnectionCredentialRotationDAL.findByIdWithConnection(rotationId);
    if (!rotationWithConnection) throw new NotFoundError({ message: `Rotation ${rotationId} not found` });

    const {
      connectionId,
      strategy,
      encryptedStrategyConfig: encryptedConfig,
      encryptedGeneratedCredentials: encryptedGenCreds,
      activeIndex,
      rotationInterval,
      connectionName,
      orgId,
      isAutoRotationEnabled
    } = rotationWithConnection;

    const now = new Date();
    const rotateAtUtc = rotationWithConnection.rotateAtUtc as { hours: number; minutes: number };

    try {
      // Acquire lock to prevent concurrent rotations
      const lockKey = `credential-rotation-lock-${rotationId}`;
      const lock = await keyStore.acquireLock([lockKey], 60_000);

      try {
        // Decrypt connection credentials (for Graph API self-rotation)
        const connection = await appConnectionDAL.findById(connectionId);
        if (!connection) throw new Error(`Connection ${connectionId} not found`);

        const credentials = await getConnectionClientCredentials(connection);

        // Decrypt strategy config and generated credentials
        const config = await decryptStrategyConfig<TAppConnectionCredentialRotationStrategyConfig>({
          orgId,
          encryptedStrategyConfig: encryptedConfig,
          kmsService
        });

        const generatedCredentials = await decryptCredentialRotationGeneratedCredentials({
          orgId,
          encryptedGeneratedCredentials: encryptedGenCreds,
          kmsService
        });

        const provider =
          CREDENTIAL_ROTATION_PROVIDER_FACTORY_MAP[strategy as AppConnectionCredentialRotationStrategy](connection);

        // Two-credential rotation: create-first, revoke-after.
        // This ordering ensures that if create fails, we still have 2 valid secrets.
        const inactiveIndex = (activeIndex + 1) % MAX_GENERATED_CREDENTIALS_LENGTH;
        const inactiveCredential = generatedCredentials[inactiveIndex];

        const credentialsSchema =
          CREDENTIAL_ROTATION_CREDENTIALS_SCHEMA_MAP[strategy as AppConnectionCredentialRotationStrategy];

        const parsedCredentials = credentialsSchema.safeParse(credentials);
        if (!parsedCredentials.success) {
          throw new BadRequestError({
            message: `Failed to parse credentials for ${strategy} connection`
          });
        }

        // Step 1: Create new credential first (safe — worst case we have 3 secrets temporarily)
        const newCredential = await provider.createCredential(
          config,
          parsedCredentials.data,
          rotationInterval,
          inactiveIndex
        );

        // Step 2: Update connection credentials with new secret
        const updatedCredentials = provider.mergeCredentials(
          credentials,
          newCredential
        ) as TAppConnection["credentials"];
        await updateConnectionCredentials(connectionId, updatedCredentials);

        // Step 3: Revoke old credential at inactive index (best-effort, non-fatal)
        // If this fails, we have 3 secrets temporarily — they'll be cleaned up on the next cycle.
        if (inactiveCredential) {
          try {
            logger.info(
              `credentialRotation: Revoking old credential keyId=${inactiveCredential.keyId} at index=${inactiveIndex} [rotationId=${rotationId}]`
            );
            await provider.revokeCredential(inactiveCredential, config, parsedCredentials.data);
          } catch (revokeError) {
            logger.warn(
              revokeError,
              `credentialRotation: Failed to revoke old credential keyId=${inactiveCredential.keyId} [rotationId=${rotationId}] — will retry on next cycle`
            );
          }
        }

        // Step 4: Store new credential and swap active index
        const updatedGeneratedCredentials = [...generatedCredentials];
        updatedGeneratedCredentials[inactiveIndex] = newCredential;

        const encryptedUpdatedGenCreds = await encryptCredentialRotationGeneratedCredentials({
          orgId,
          generatedCredentials: updatedGeneratedCredentials,
          kmsService
        });

        const nextRotationAt = calculateNextRotationAt({
          rotateAtUtc,
          isAutoRotationEnabled,
          rotationInterval,
          rotationStatus: AppConnectionCredentialRotationStatus.Success,
          isManualRotation: options.isManualRotation ?? false,
          lastRotatedAt: now
        });

        await appConnectionCredentialRotationDAL.updateById(rotationId, {
          activeIndex: inactiveIndex,
          encryptedGeneratedCredentials: encryptedUpdatedGenCreds,
          rotationStatus: AppConnectionCredentialRotationStatus.Success,
          lastRotatedAt: now,
          lastRotationAttemptedAt: now,
          lastRotationJobId: options.jobId,
          nextRotationAt,
          encryptedLastRotationMessage: null
        });

        logger.info(
          `credentialRotation: Successfully rotated [rotationId=${rotationId}] [connectionId=${connectionId}]`
        );
      } finally {
        await lock.release();
      }
    } catch (error) {
      logger.error(error, `credentialRotation: Failed to rotate [rotationId=${rotationId}]`);

      const errorMessage = parseRotationErrorMessage(error);
      const encryptedMessage = await encryptRotationMessage({
        orgId,
        message: errorMessage,
        kmsService
      });

      const nextRotationAt = calculateNextRotationAt({
        rotateAtUtc,
        isAutoRotationEnabled,
        rotationInterval,
        rotationStatus: AppConnectionCredentialRotationStatus.Failed,
        isManualRotation: options.isManualRotation ?? false,
        lastRotatedAt: now
      });

      await appConnectionCredentialRotationDAL.updateById(rotationId, {
        rotationStatus: AppConnectionCredentialRotationStatus.Failed,
        lastRotationAttemptedAt: now,
        lastRotationJobId: options.jobId,
        encryptedLastRotationMessage: encryptedMessage,
        nextRotationAt
      });

      if (options.shouldSendNotification && options.isFinalAttempt) {
        await queueService.queue(
          QueueName.AppConnectionCredentialRotation,
          QueueJobs.AppConnectionCredentialRotationSendNotification,
          {
            connectionId,
            connectionName,
            orgId,
            strategy,
            lastRotationAttemptedAt: now
          },
          {
            jobId: `app-connection-credential-rotation-notification-${rotationId}-${Date.now()}`,
            removeOnFail: true,
            removeOnComplete: true
          }
        );
      }

      throw error;
    }
  };

  return {
    createRotation,
    updateRotation,
    getRotationByConnectionId,
    triggerRotation,
    rotateCredentials
  };
};
