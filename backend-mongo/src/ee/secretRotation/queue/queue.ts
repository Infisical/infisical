import Queue, { Job } from "bull";
import { client, getEncryptionKey, getRootEncryptionKey } from "../../../config";
import { BotService, EventService, TelemetryService } from "../../../services";
import { SecretRotation } from "../models";
import { rotationTemplates } from "../templates";
import {
  ISecretRotationData,
  ISecretRotationEncData,
  ISecretRotationProviderTemplate,
  TProviderFunctionTypes
} from "../types";
import {
  decryptSymmetric128BitHexKeyUTF8,
  encryptSymmetric128BitHexKeyUTF8
} from "../../../utils/crypto";
import { ISecret, Secret } from "../../../models";
import { ENCODING_SCHEME_BASE64, ENCODING_SCHEME_UTF8, SECRET_SHARED } from "../../../variables";
import { EESecretService } from "../../services";
import { SecretVersion } from "../../models";
import { eventPushSecrets } from "../../../events";
import { logger } from "../../../utils/logging";

import {
  secretRotationPreSetFn,
  secretRotationRemoveFn,
  secretRotationSetFn,
  secretRotationTestFn
} from "./queue.utils";

const secretRotationQueue = new Queue("secret-rotation-service", process.env.REDIS_URL as string);

secretRotationQueue.process(async (job: Job) => {
  logger.info(`secretRotationQueue.process: [rotationDocument=${job.data.rotationDocId}]`);
  const rotationStratDocId = job.data.rotationDocId;
  const secretRotation = await SecretRotation.findById(rotationStratDocId)
    .select("+encryptedData +encryptedDataTag +encryptedDataIV +keyEncoding")
    .populate<{
      outputs: [
        {
          key: string;
          secret: ISecret;
        }
      ];
    }>("outputs.secret");

  const infisicalRotationProvider = rotationTemplates.find(
    ({ name }) => name === secretRotation?.provider
  );

  try {
    if (!infisicalRotationProvider || !secretRotation)
      throw new Error("Failed to find rotation strategy");

    if (secretRotation.outputs.some(({ secret }) => !secret))
      throw new Error("Secrets not found in dashboard");

    const workspaceId = secretRotation.workspace;

    // deep copy
    const provider = JSON.parse(
      JSON.stringify(infisicalRotationProvider)
    ) as ISecretRotationProviderTemplate;

    // decrypt user  provided inputs for secret rotation
    const encryptionKey = await getEncryptionKey();
    const rootEncryptionKey = await getRootEncryptionKey();
    let decryptedData = "";
    if (rootEncryptionKey && secretRotation.keyEncoding === ENCODING_SCHEME_BASE64) {
      // case: encoding scheme is base64
      decryptedData = client.decryptSymmetric(
        secretRotation.encryptedData,
        rootEncryptionKey,
        secretRotation.encryptedDataIV,
        secretRotation.encryptedDataTag
      );
    } else if (encryptionKey && secretRotation.keyEncoding === ENCODING_SCHEME_UTF8) {
      // case: encoding scheme is utf8
      decryptedData = decryptSymmetric128BitHexKeyUTF8({
        ciphertext: secretRotation.encryptedData,
        iv: secretRotation.encryptedDataIV,
        tag: secretRotation.encryptedDataTag,
        key: encryptionKey
      });
    }

    const variables = JSON.parse(decryptedData) as ISecretRotationEncData;

    // rotation set cycle
    const newCredential: ISecretRotationData = {
      inputs: variables.inputs,
      outputs: {},
      internal: {}
    };
    // special glue code for database
    if (provider.template.functions.set.type === TProviderFunctionTypes.DB) {
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
    }
    if (provider.template.functions.set?.pre) {
      secretRotationPreSetFn(provider.template.functions.set.pre, newCredential);
    }
    await secretRotationSetFn(provider.template.functions.set, newCredential);
    await secretRotationTestFn(provider.template.functions.test, newCredential);

    if (variables.creds.length === 2) {
      const deleteCycleCred = variables.creds.pop();
      if (deleteCycleCred && provider.template.functions.remove) {
        const deleteCycleVar = { inputs: variables.inputs, ...deleteCycleCred };
        await secretRotationRemoveFn(provider.template.functions.remove, deleteCycleVar);
      }
    }
    variables.creds.unshift({ outputs: newCredential.outputs, internal: newCredential.internal });
    const { ciphertext, iv, tag } = client.encryptSymmetric(
      JSON.stringify(variables),
      rootEncryptionKey
    );

    // save the rotation state
    await SecretRotation.findByIdAndUpdate(rotationStratDocId, {
      encryptedData: ciphertext,
      encryptedDataIV: iv,
      encryptedDataTag: tag,
      status: "success",
      statusMessage: "Rotated successfully",
      lastRotatedAt: new Date().toUTCString()
    });

    const key = await BotService.getWorkspaceKeyWithBot({
      workspaceId: secretRotation.workspace
    });

    const encryptedSecrets = secretRotation.outputs.map(({ key: outputKey, secret }) => ({
      secret,
      value: encryptSymmetric128BitHexKeyUTF8({
        plaintext:
          typeof newCredential.outputs[outputKey] === "object"
            ? JSON.stringify(newCredential.outputs[outputKey])
            : String(newCredential.outputs[outputKey]),
        key
      })
    }));

    // now save the secret do a bulk update
    // can't use the updateSecret function due to various parameter required issue
    // REFACTOR(akhilmhdh): secret module should be lot more flexible. Ability to update bulk or individually by blindIndex, by id etc
    await Secret.bulkWrite(
      encryptedSecrets.map(({ secret, value }) => ({
        updateOne: {
          filter: {
            workspace: workspaceId,
            environment: secretRotation.environment,
            _id: secret._id,
            type: SECRET_SHARED
          },
          update: {
            $inc: {
              version: 1
            },
            secretValueCiphertext: value.ciphertext,
            secretValueIV: value.iv,
            secretValueTag: value.tag
          }
        }
      }))
    );

    await EESecretService.addSecretVersions({
      secretVersions: encryptedSecrets.map(({ secret, value }) => {
        const {
          _id,
          version,
          workspace,
          type,
          folder,
          secretBlindIndex,
          secretKeyIV,
          secretKeyTag,
          secretKeyCiphertext,
          skipMultilineEncoding,
          environment,
          algorithm,
          keyEncoding
        } = secret;

        return new SecretVersion({
          secret: _id,
          version: version + 1,
          workspace: workspace,
          type,
          folder,
          environment,
          isDeleted: false,
          secretBlindIndex: secretBlindIndex,
          secretKeyCiphertext: secretKeyCiphertext,
          secretKeyIV: secretKeyIV,
          secretKeyTag: secretKeyTag,
          secretValueCiphertext: value.ciphertext,
          secretValueIV: value.iv,
          secretValueTag: value.tag,
          algorithm,
          keyEncoding,
          skipMultilineEncoding
        });
      })
    });

    // akhilmhdh: @tony need to do something about this as its depend on authData which is not possibile in here
    // await EEAuditLogService.createAuditLog(
    //   {actor:ActorType.Machine},
    //   {
    //     type: EventType.UPDATE_SECRETS,
    //     metadata: {
    //       environment,
    //       secretPath,
    //       secrets: secretsToBeUpdated.map(({ _id, version, secretBlindIndex }) => ({
    //         secretId: _id.toString(),
    //         secretKey: secretBlindIndexToKey[secretBlindIndex || ""],
    //         secretVersion: version + 1
    //       }))
    //     }
    //   },
    //   {
    //     workspaceId
    //   }
    // );

    const folderId = encryptedSecrets?.[0]?.secret?.folder;
    // (EE) take a secret snapshot
    await EESecretService.takeSecretSnapshot({
      workspaceId,
      environment: secretRotation.environment,
      folderId
    });

    await EventService.handleEvent({
      event: eventPushSecrets({
        workspaceId: secretRotation.workspace,
        environment: secretRotation.environment,
        secretPath: secretRotation.secretPath
      })
    });

    const postHogClient = await TelemetryService.getPostHogClient();
    if (postHogClient) {
      postHogClient.capture({
        event: "secrets rotated",
        properties: {
          numberOfSecrets: encryptedSecrets.length,
          environment: secretRotation.environment,
          workspaceId,
          folderId
        }
      });
    }
  } catch (err) {
    logger.error(err);
    await SecretRotation.findByIdAndUpdate(rotationStratDocId, {
      status: "failed",
      statusMessage: (err as Error).message,
      lastRotatedAt: new Date().toUTCString()
    });
  }

  return Promise.resolve();
});

const daysToMillisecond = (days: number) => days * 24 * 60 * 60 * 1000;
export const startSecretRotationQueue = async (rotationDocId: string, interval: number) => {
  // when migration to bull mq just use the option immedite to trigger repeatable immediately
  secretRotationQueue.add({ rotationDocId }, { jobId: rotationDocId, removeOnComplete: true });
  return secretRotationQueue.add(
    { rotationDocId },
    { repeat: { every: daysToMillisecond(interval) }, jobId: rotationDocId }
  );
};

export const removeSecretRotationQueue = async (rotationDocId: string, interval: number) => {
  return secretRotationQueue.removeRepeatable({ every: interval * 1000, jobId: rotationDocId });
};
