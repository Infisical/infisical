import { SecretKeyEncoding, SecretType } from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";
import {
  encryptSymmetric128BitHexKeyUTF8,
  infisicalSymmetricDecrypt,
  infisicalSymmetricEncypt
} from "@app/lib/crypto/encryption";
import { daysToMillisecond, secondsToMillis } from "@app/lib/dates";
import { logger } from "@app/lib/logger";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
import { TProjectBotServiceFactory } from "@app/services/project-bot/project-bot-service";
import { TSecretDALFactory } from "@app/services/secret/secret-dal";
import { TSecretVersionDALFactory } from "@app/services/secret/secret-version-dal";
import { TTelemetryServiceFactory } from "@app/services/telemetry/telemetry-service";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

import { TSecretRotationDALFactory } from "../secret-rotation-dal";
import { rotationTemplates } from "../templates";
import {
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
import {
  TSecretRotationData,
  TSecretRotationDbFn,
  TSecretRotationEncData
} from "./secret-rotation-queue-types";

export type TSecretRotationQueueFactory = ReturnType<typeof secretRotationQueueFactory>;

type TSecretRotationQueueFactoryDep = {
  queue: TQueueServiceFactory;
  secretRotationDAL: TSecretRotationDALFactory;
  projectBotService: Pick<TProjectBotServiceFactory, "getBotKey">;
  secretDAL: Pick<TSecretDALFactory, "bulkUpdate" | "find">;
  secretVersionDAL: Pick<TSecretVersionDALFactory, "insertMany" | "findLatestVersionMany">;
  telemetryService: Pick<TTelemetryServiceFactory, "sendPostHogEvents">;
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
  telemetryService
}: TSecretRotationQueueFactoryDep) => {
  const addToQueue = async (rotationId: string, interval: number) => {
    const appCfg = getConfig();
    queue.queue(
      QueueName.SecretRotation,
      QueueJobs.SecretRotation,
      { rotationId },
      {
        jobId: rotationId,
        repeat: {
          // on prod it this will be in days, in development this will be second
          every:
            appCfg.NODE_ENV === "development"
              ? secondsToMillis(interval)
              : daysToMillisecond(interval),
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
        every:
          appCfg.NODE_ENV === "development"
            ? secondsToMillis(interval)
            : daysToMillisecond(interval)
      },
      rotationId
    );
  };

  queue.start(QueueName.SecretRotation, async (job) => {
    const { rotationId } = job.data;
    logger.info(`secretRotationQueue.process: [rotationDocument=${rotationId}]`);
    const secretRotation = await secretRotationDAL.findById(rotationId);
    const rotationProvider = rotationTemplates.find(
      ({ name }) => name === secretRotation?.provider
    );

    try {
      if (!rotationProvider || !secretRotation)
        throw new DisableRotationErrors({ message: "Provider not found" });

      const rotationOutputs = await secretRotationDAL.findRotationOutputsByRotationId(rotationId);
      if (!rotationOutputs.length)
        throw new DisableRotationErrors({ message: "Secrets not found" });

      // deep copy
      const provider = JSON.parse(
        JSON.stringify(rotationProvider)
      ) as TSecretRotationProviderTemplate;

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

      // when its a database we keep cycling the variables accordingly
      if (provider.template.type === TProviderFunctionTypes.DB) {
        const lastCred = variables.creds.at(-1);
        if (lastCred && variables.creds.length === 1) {
          newCredential.internal.username =
            lastCred.internal.username === variables.inputs.username1
              ? variables.inputs.username2
              : variables.inputs.username1;
        } else {
          newCredential.internal.username = lastCred
            ? lastCred.internal.username
            : variables.inputs.username1;
        }
        // set a random value for new password
        newCredential.internal.rotated_password = alphaNumericNanoId(32);
        const {
          admin_username: username,
          admin_password: password,
          host,
          database,
          port,
          ca
        } = newCredential.inputs;
        const dbFunctionArg = {
          username,
          password,
          host,
          database,
          port,
          ca: ca as string,
          client:
            provider.template.client === TDbProviderClients.MySql
              ? "mysql2"
              : provider.template.client
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
      variables.creds.unshift({
        outputs: newCredential.outputs,
        internal: newCredential.internal
      });
      const encVarData = infisicalSymmetricEncypt(JSON.stringify(variables));
      const key = await projectBotService.getBotKey(secretRotation.projectId);
      const encryptedSecrets = rotationOutputs.map(({ key: outputKey, secretId }) => ({
        secretId,
        value: encryptSymmetric128BitHexKeyUTF8(
          typeof newCredential.outputs[outputKey] === "object"
            ? JSON.stringify(newCredential.outputs[outputKey])
            : String(newCredential.outputs[outputKey]),
          key
        )
      }));
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
          updatedSecrets.map(({ id, updatedAt, createdAt, ...el }) => ({
            ...el,
            secretId: id
          })),
          tx
        );
      });

      telemetryService.sendPostHogEvents({
        event: PostHogEventTypes.SecretRotated,
        distinctId: "",
        properties: {
          numberOfSecrets: encryptedSecrets.length,
          environment: secretRotation.environment.slug,
          secretPath: secretRotation.secretPath,
          workspaceId: secretRotation.projectId
        }
      });

      logger.info("Finished rotating: rotation id: ", rotationId);
    } catch (error) {
      logger.error(error);
      if (error instanceof DisableRotationErrors) {
        if (job.id) {
          queue.stopRepeatableJobByJobId(QueueName.SecretRotation, job.id);
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
