import {
  CreateAccessKeyCommand,
  DeleteAccessKeyCommand,
  GetAccessKeyLastUsedCommand,
  IAMClient
} from "@aws-sdk/client-iam";

import { SecretType } from "@app/db/schemas";
import { CustomAWSHasher } from "@app/lib/aws/hashing";
import { getConfig } from "@app/lib/config/env";
import { crypto, SymmetricKeySize } from "@app/lib/crypto/cryptography";
import { daysToMillisecond, secondsToMillis } from "@app/lib/dates";
import { NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
import { ActorType } from "@app/services/auth/auth-type";
import { CommitType, TFolderCommitServiceFactory } from "@app/services/folder-commit/folder-commit-service";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TProjectBotServiceFactory } from "@app/services/project-bot/project-bot-service";
import { TSecretDALFactory } from "@app/services/secret/secret-dal";
import { TSecretVersionDALFactory } from "@app/services/secret/secret-version-dal";
import { TSecretV2BridgeDALFactory } from "@app/services/secret-v2-bridge/secret-v2-bridge-dal";
import { TSecretVersionV2DALFactory } from "@app/services/secret-v2-bridge/secret-version-dal";
import { TTelemetryServiceFactory } from "@app/services/telemetry/telemetry-service";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

import { TSecretRotationDALFactory } from "../secret-rotation-dal";
import { rotationTemplates } from "../templates";
import {
  TAwsProviderSystems,
  TDbProviderClients,
  TProviderFunctionTypes,
  TSecretRotationProviderTemplate
} from "../templates/types";
import {
  getDbSetQuery,
  secretRotationDbFn,
  secretRotationHttpFn,
  secretRotationHttpSetFn,
  secretRotationPreSetFn
} from "./secret-rotation-queue-fn";
import { TSecretRotationData, TSecretRotationDbFn, TSecretRotationEncData } from "./secret-rotation-queue-types";

export type TSecretRotationQueueFactory = ReturnType<typeof secretRotationQueueFactory>;

type TSecretRotationQueueFactoryDep = {
  queue: TQueueServiceFactory;
  secretRotationDAL: TSecretRotationDALFactory;
  projectBotService: Pick<TProjectBotServiceFactory, "getBotKey">;
  secretDAL: Pick<TSecretDALFactory, "bulkUpdate" | "find">;
  secretV2BridgeDAL: Pick<TSecretV2BridgeDALFactory, "bulkUpdate" | "find" | "invalidateSecretCacheByProjectId">;
  secretVersionDAL: Pick<TSecretVersionDALFactory, "insertMany" | "findLatestVersionMany">;
  secretVersionV2BridgeDAL: Pick<TSecretVersionV2DALFactory, "insertMany" | "findLatestVersionMany">;
  telemetryService: Pick<TTelemetryServiceFactory, "sendPostHogEvents">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  folderCommitService: Pick<TFolderCommitServiceFactory, "createCommit">;
};

// These error should stop the repeatable job and ask user to reconfigure rotation
export class DisableRotationErrors extends Error {
  name: string;

  error: unknown;

  constructor({ name, error, message }: { message: string; name?: string; error?: unknown }) {
    super(message);
    this.name = name || "DisableRotationErrors";
    this.error = error;
  }
}

export const secretRotationQueueFactory = ({
  queue,
  secretRotationDAL,
  projectBotService,
  secretDAL,
  secretVersionDAL,
  telemetryService,
  secretV2BridgeDAL,
  secretVersionV2BridgeDAL,
  folderCommitService,
  kmsService
}: TSecretRotationQueueFactoryDep) => {
  const addToQueue = async () => {};

  const removeFromQueue = async (rotationId: string, interval: number) => {
    const appCfg = getConfig();
    await queue.stopRepeatableJob(
      QueueName.SecretRotation,
      QueueJobs.SecretRotation,
      {
        // on prod it this will be in days, in development this will be second
        every: appCfg.NODE_ENV === "development" ? secondsToMillis(interval) : daysToMillisecond(interval)
      },
      rotationId
    );
  };

  queue.start(QueueName.SecretRotation, async (job) => {
    const { rotationId } = job.data;
    const appCfg = getConfig();

    logger.info(`secretRotationQueue.process: [rotationDocument=${rotationId}]`);
    const secretRotation = await secretRotationDAL.findById(rotationId);
    const rotationProvider = rotationTemplates.find(({ name }) => name === secretRotation?.provider);

    try {
      if (!rotationProvider || !secretRotation) throw new DisableRotationErrors({ message: "Provider not found" });

      const { botKey, shouldUseSecretV2Bridge } = await projectBotService.getBotKey(secretRotation.projectId);
      let rotationOutputs;
      if (shouldUseSecretV2Bridge) {
        rotationOutputs = await secretRotationDAL.findRotationOutputsV2ByRotationId(rotationId);
      } else {
        rotationOutputs = await secretRotationDAL.findRotationOutputsByRotationId(rotationId);
      }
      if (!rotationOutputs.length) throw new DisableRotationErrors({ message: "Secrets not found" });

      // deep copy
      const provider = JSON.parse(JSON.stringify(rotationProvider)) as TSecretRotationProviderTemplate;
      const { encryptor: secretManagerEncryptor, decryptor: secretManagerDecryptor } =
        await kmsService.createCipherPairWithDataKey({
          type: KmsDataKey.SecretManager,
          projectId: secretRotation.projectId
        });

      const decryptedData = secretManagerDecryptor({
        cipherTextBlob: secretRotation.encryptedRotationData
      }).toString();

      const variables = JSON.parse(decryptedData) as TSecretRotationEncData;
      // rotation set cycle
      const newCredential: TSecretRotationData = {
        inputs: variables.inputs,
        outputs: {},
        internal: {}
      };

      /* Rotation Function For Database
       * A database like sql cannot have multiple password for a user
       * thus we ask users to create two users with required permission and then we keep cycling between these two db users
       */
      if (provider.template.type === TProviderFunctionTypes.DB) {
        const lastCred = variables.creds.at(-1);
        if (lastCred && variables.creds.length === 1) {
          newCredential.internal.username =
            lastCred.internal.username === variables.inputs.username1
              ? variables.inputs.username2
              : variables.inputs.username1;
        } else {
          newCredential.internal.username = lastCred ? lastCred.internal.username : variables.inputs.username1;
        }
        // set a random value for new password
        newCredential.internal.rotated_password = alphaNumericNanoId(32);
        const { admin_username: username, admin_password: password, host, database, port, ca } = newCredential.inputs;

        const options =
          provider.template.client === TDbProviderClients.MsSqlServer
            ? ({
                encrypt: appCfg.ENABLE_MSSQL_SECRET_ROTATION_ENCRYPT,
                // when ca is provided use that
                trustServerCertificate: !ca,
                cryptoCredentialsDetails: ca ? { ca } : {}
              } as Record<string, unknown>)
            : undefined;

        const dbFunctionArg = {
          username,
          password,
          host,
          database,
          port,
          ca: ca as string,
          client: provider.template.client === TDbProviderClients.MySql ? "mysql2" : provider.template.client,
          options
        } as TSecretRotationDbFn;

        // set function
        await secretRotationDbFn({
          ...dbFunctionArg,
          ...getDbSetQuery(provider.template.client, {
            password: newCredential.internal.rotated_password as string,
            username: newCredential.internal.username as string
          })
        });

        // test function
        const testQuery =
          provider.template.client === TDbProviderClients.MsSqlServer ? "SELECT GETDATE()" : "SELECT NOW()";

        await secretRotationDbFn({
          ...dbFunctionArg,
          query: testQuery,
          variables: []
        });

        newCredential.outputs.db_username = newCredential.internal.username;
        newCredential.outputs.db_password = newCredential.internal.rotated_password;
        // clean up
        if (variables.creds.length === 2) variables.creds.pop();
      }

      /*
       * Rotation Function For AWS Services
       * Due to complexity in AWS Authorization hashing signature process we keep it as seperate entity instead of http template mode
       * We first delete old key before creating a new one because aws iam has a quota limit of 2 keys
       * */
      if (provider.template.type === TProviderFunctionTypes.AWS) {
        if (provider.template.client === TAwsProviderSystems.IAM) {
          const client = new IAMClient({
            useFipsEndpoint: crypto.isFipsModeEnabled(),
            sha256: CustomAWSHasher,
            region: newCredential.inputs.manager_user_aws_region as string,
            credentials: {
              accessKeyId: newCredential.inputs.manager_user_access_key as string,
              secretAccessKey: newCredential.inputs.manager_user_secret_key as string
            }
          });

          const iamUserName = newCredential.inputs.iam_username as string;

          if (variables.creds.length === 2) {
            const deleteCycleCredential = variables.creds.pop();
            if (deleteCycleCredential) {
              const deletedIamAccessKey = await client.send(
                new DeleteAccessKeyCommand({
                  UserName: iamUserName,
                  AccessKeyId: deleteCycleCredential.outputs.iam_user_access_key as string
                })
              );

              if (
                !deletedIamAccessKey?.$metadata?.httpStatusCode ||
                deletedIamAccessKey?.$metadata?.httpStatusCode > 300
              ) {
                throw new DisableRotationErrors({
                  message: "Failed to delete aws iam access key. Check managed iam user policy"
                });
              }
            }
          }

          const newIamAccessKey = await client.send(new CreateAccessKeyCommand({ UserName: iamUserName }));
          if (!newIamAccessKey.AccessKey)
            throw new DisableRotationErrors({ message: "Failed to create access key. Check managed iam user policy" });

          // test
          const testAccessKey = await client.send(
            new GetAccessKeyLastUsedCommand({ AccessKeyId: newIamAccessKey.AccessKey.AccessKeyId })
          );
          if (testAccessKey?.UserName !== iamUserName)
            throw new DisableRotationErrors({ message: "Failed to create access key. Check managed iam user policy" });

          newCredential.outputs.iam_user_access_key = newIamAccessKey.AccessKey.AccessKeyId;
          newCredential.outputs.iam_user_secret_key = newIamAccessKey.AccessKey.SecretAccessKey;
        }
      }

      /* Rotation function of HTTP infisical template
       * This is a generic http based template system for rotation
       * we use this for sendgrid and for custom secret rotation
       * This will ensure user provided rotation is easier to make
       * */
      if (provider.template.type === TProviderFunctionTypes.HTTP) {
        if (provider.template.functions.set?.pre) {
          secretRotationPreSetFn(provider.template.functions.set.pre, newCredential);
        }
        await secretRotationHttpSetFn(provider.template.functions.set, newCredential);
        // now test
        await secretRotationHttpFn(provider.template.functions.test, newCredential);
        if (variables.creds.length === 2) {
          const deleteCycleCred = variables.creds.pop();
          if (deleteCycleCred && provider.template.functions.remove) {
            const deleteCycleVar = { inputs: variables.inputs, ...deleteCycleCred };
            await secretRotationHttpFn(provider.template.functions.remove, deleteCycleVar);
          }
        }
      }

      // insert the new variables to start
      // encrypt the data - save it
      variables.creds.unshift({
        outputs: newCredential.outputs,
        internal: newCredential.internal
      });
      const encryptedRotationData = secretManagerEncryptor({
        plainText: Buffer.from(JSON.stringify(variables))
      }).cipherTextBlob;

      const numberOfSecretsRotated = rotationOutputs.length;
      if (shouldUseSecretV2Bridge) {
        const encryptedSecrets = rotationOutputs.map(({ key: outputKey, secretId }) => ({
          secretId,
          value:
            typeof newCredential.outputs[outputKey] === "object"
              ? JSON.stringify(newCredential.outputs[outputKey])
              : String(newCredential.outputs[outputKey])
        }));
        // map the final values to output keys in the board
        await secretRotationDAL.transaction(async (tx) => {
          await secretRotationDAL.updateById(
            rotationId,
            {
              encryptedRotationData,
              lastRotatedAt: new Date(),
              statusMessage: "Rotated successfull",
              status: "success"
            },
            tx
          );
          const updatedSecrets = await secretV2BridgeDAL.bulkUpdate(
            encryptedSecrets.map(({ secretId, value }) => ({
              // this secret id is validated when user is inserted
              filter: { id: secretId, type: SecretType.Shared },
              data: {
                encryptedValue: secretManagerEncryptor({ plainText: Buffer.from(value) }).cipherTextBlob
              }
            })),
            tx
          );
          const secretVersions = await secretVersionV2BridgeDAL.insertMany(
            updatedSecrets.map(({ id, updatedAt, createdAt, ...el }) => ({
              ...el,
              actorType: ActorType.PLATFORM,
              secretId: id
            })),
            tx
          );

          await folderCommitService.createCommit(
            {
              actor: {
                type: ActorType.PLATFORM
              },
              message: "Changed by Secret rotation",
              folderId: secretVersions[0].folderId,
              changes: secretVersions.map((sv) => ({
                type: CommitType.ADD,
                isUpdate: true,
                secretVersionId: sv.id
              }))
            },
            tx
          );
          await secretV2BridgeDAL.invalidateSecretCacheByProjectId(secretRotation.projectId, tx);
        });
      } else {
        if (!botKey)
          throw new NotFoundError({
            message: `Project bot not found for project with ID '${secretRotation.projectId}'`
          });

        const encryptedSecrets = rotationOutputs.map(({ key: outputKey, secretId }) => ({
          secretId,
          value: crypto
            .encryption()
            .symmetric()
            .encrypt({
              plaintext:
                typeof newCredential.outputs[outputKey] === "object"
                  ? JSON.stringify(newCredential.outputs[outputKey])
                  : String(newCredential.outputs[outputKey]),
              key: botKey,
              keySize: SymmetricKeySize.Bits128
            })
        }));

        // map the final values to output keys in the board
        await secretRotationDAL.transaction(async (tx) => {
          await secretRotationDAL.updateById(
            rotationId,
            {
              encryptedRotationData,
              lastRotatedAt: new Date(),
              statusMessage: "Rotated successfull",
              status: "success"
            },
            tx
          );
          const updatedSecrets = await secretDAL.bulkUpdate(
            encryptedSecrets.map(({ secretId, value }) => ({
              // this secret id is validated when user is inserted
              filter: { id: secretId, type: SecretType.Shared },
              data: {
                secretValueCiphertext: value.ciphertext,
                secretValueIV: value.iv,
                secretValueTag: value.tag
              }
            })),
            tx
          );
          await secretVersionDAL.insertMany(
            updatedSecrets.map(({ id, updatedAt, createdAt, ...el }) => {
              if (!el.secretBlindIndex) {
                throw new NotFoundError({ message: `Secret blind index not found on secret with ID '${id}` });
              }
              return {
                ...el,
                secretId: id,
                secretBlindIndex: el.secretBlindIndex
              };
            }),
            tx
          );
        });
      }

      await telemetryService.sendPostHogEvents({
        event: PostHogEventTypes.SecretRotated,
        distinctId: "",
        properties: {
          numberOfSecrets: numberOfSecretsRotated,
          environment: secretRotation.environment.slug,
          secretPath: secretRotation.secretPath,
          projectId: secretRotation.projectId
        }
      });

      logger.info("Finished rotating: rotation id: ", rotationId);
    } catch (error) {
      logger.error(error, "Failed to execute secret rotation");
      if (error instanceof DisableRotationErrors) {
        if (job.id) {
          await queue.stopRepeatableJobByJobId(QueueName.SecretRotation, job.id);
        }
      }

      await secretRotationDAL.updateById(rotationId, {
        status: "failed",
        statusMessage: (error as Error).message.slice(0, 500),
        lastRotatedAt: new Date()
      });
    }
  });

  return {
    addToQueue,
    removeFromQueue
  };
};
