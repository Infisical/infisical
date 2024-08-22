import {
  CreateAccessKeyCommand,
  DeleteAccessKeyCommand,
  GetAccessKeyLastUsedCommand,
  IAMClient
} from "@aws-sdk/client-iam";

import { SecretKeyEncoding, SecretType } from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";
import {
  encryptSymmetric128BitHexKeyUTF8,
  infisicalSymmetricDecrypt,
  infisicalSymmetricEncypt
} from "@app/lib/crypto/encryption";
import { daysToMillisecond, secondsToMillis } from "@app/lib/dates";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
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
  secretV2BridgeDAL: Pick<TSecretV2BridgeDALFactory, "bulkUpdate" | "find">;
  secretVersionDAL: Pick<TSecretVersionDALFactory, "insertMany" | "findLatestVersionMany">;
  secretVersionV2BridgeDAL: Pick<TSecretVersionV2DALFactory, "insertMany" | "findLatestVersionMany">;
  telemetryService: Pick<TTelemetryServiceFactory, "sendPostHogEvents">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
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
  kmsService
}: TSecretRotationQueueFactoryDep) => {
  const addToQueue = async (rotationId: string, interval: number) => {
    const appCfg = getConfig();
    await queue.queue(
      QueueName.SecretRotation,
      QueueJobs.SecretRotation,
      { rotationId },
      {
        jobId: rotationId,
        repeat: {
          // on prod it this will be in days, in development this will be second
          every: appCfg.NODE_ENV === "development" ? secondsToMillis(interval) : daysToMillisecond(interval),
          immediately: true
        }
      }
    );
  };

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

      // now get the encrypted variable values
      // in includes the inputs, the previous outputs
      // internal mapping variables etc
      const { encryptedDataTag, encryptedDataIV, encryptedData, keyEncoding } = secretRotation;
      if (!encryptedDataTag || !encryptedDataIV || !encryptedData || !keyEncoding) {
        throw new DisableRotationErrors({ message: "No inputs found" });
      }
      const decryptedData = infisicalSymmetricDecrypt({
        keyEncoding: keyEncoding as SecretKeyEncoding,
        ciphertext: encryptedData,
        iv: encryptedDataIV,
        tag: encryptedDataTag
      });

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
        const dbFunctionArg = {
          username,
          password,
          host,
          database,
          port,
          ca: ca as string,
          client: provider.template.client === TDbProviderClients.MySql ? "mysql2" : provider.template.client
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
        await secretRotationDbFn({
          ...dbFunctionArg,
          query: "SELECT NOW()",
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
      const encVarData = infisicalSymmetricEncypt(JSON.stringify(variables));
      const { encryptor: secretManagerEncryptor } = await kmsService.createCipherPairWithDataKey({
        type: KmsDataKey.SecretManager,
        projectId: secretRotation.projectId
      });

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
              encryptedData: encVarData.ciphertext,
              encryptedDataIV: encVarData.iv,
              encryptedDataTag: encVarData.tag,
              keyEncoding: encVarData.encoding,
              algorithm: encVarData.algorithm,
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
          await secretVersionV2BridgeDAL.insertMany(
            updatedSecrets.map(({ id, updatedAt, createdAt, ...el }) => ({
              ...el,
              secretId: id
            })),
            tx
          );
        });
      } else {
        if (!botKey) throw new BadRequestError({ message: "Bot not found" });
        const encryptedSecrets = rotationOutputs.map(({ key: outputKey, secretId }) => ({
          secretId,
          value: encryptSymmetric128BitHexKeyUTF8(
            typeof newCredential.outputs[outputKey] === "object"
              ? JSON.stringify(newCredential.outputs[outputKey])
              : String(newCredential.outputs[outputKey]),
            botKey
          )
        }));
        // map the final values to output keys in the board
        await secretRotationDAL.transaction(async (tx) => {
          await secretRotationDAL.updateById(
            rotationId,
            {
              encryptedData: encVarData.ciphertext,
              encryptedDataIV: encVarData.iv,
              encryptedDataTag: encVarData.tag,
              keyEncoding: encVarData.encoding,
              algorithm: encVarData.algorithm,
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
              if (!el.secretBlindIndex) throw new BadRequestError({ message: "Missing blind index" });
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
          workspaceId: secretRotation.projectId
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
