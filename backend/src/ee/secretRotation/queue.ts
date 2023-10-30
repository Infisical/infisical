import axios from "axios";
import Queue, { Job } from "bull";
import jmespath from "jmespath";
import { customAlphabet } from "nanoid";
import { Client as PgClient } from "pg";
import mysql from "mysql";

import { client, getEncryptionKey, getRootEncryptionKey } from "../../config";
import { BotService, EventService, TelemetryService } from "../../services";
import { SecretRotation } from "./models";
import { rotationTemplates } from "./templates";
import {
  ISecretRotationData,
  ISecretRotationEncData,
  ISecretRotationProviderTemplate,
  TAssignOp,
  TDbProviderClients,
  TDbProviderFunction,
  TDirectAssignOp,
  THttpProviderFunction,
  TProviderFunction,
  TProviderFunctionTypes
} from "./types";
import {
  decryptSymmetric128BitHexKeyUTF8,
  encryptSymmetric128BitHexKeyUTF8
} from "../../utils/crypto";
import { ISecret, Secret } from "../../models";
import { ENCODING_SCHEME_BASE64, ENCODING_SCHEME_UTF8, SECRET_SHARED } from "../../variables";
import { EESecretService } from "../services";
import { SecretVersion } from "../models";
import { eventPushSecrets } from "../../events";

const REGEX = /\${([^}]+)}/g;
const SLUG_ALPHABETS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const nanoId = customAlphabet(SLUG_ALPHABETS, 10);

const secretRotationQueue = new Queue("secret-rotation-service", process.env.REDIS_URL as string);

const interpolate = (data: any, getValue: (key: string) => unknown) => {
  if (!data) return;

  if (typeof data === "number") return data;

  if (typeof data === "string") {
    return data.replace(REGEX, (_a, b) => getValue(b) as string);
  }

  if (typeof data === "object" && Array.isArray(data)) {
    data.forEach((el, index) => {
      data[index] = interpolate(el, getValue);
    });
  }

  if (typeof data === "object") {
    if ((data as { ref: string })?.ref) return getValue((data as { ref: string }).ref);
    const temp = data as Record<string, unknown>; // for converting ts object to record type
    Object.keys(temp).forEach((key) => {
      temp[key as keyof typeof temp] = interpolate(data[key as keyof typeof temp], getValue);
    });
  }
  return data;
};

const getInterpolationValue = (variables: ISecretRotationData) => (key: string) => {
  if (key.includes("|")) {
    const [keyword, ...arg] = key.split("|").map((el) => el.trim());
    switch (keyword) {
      case "random": {
        return nanoId(parseInt(arg[0], 10));
      }
      default: {
        throw Error(`Interpolation key not found - ${key}`);
      }
    }
  }
  const [type, keyName] = key.split(".").map((el) => el.trim());
  return variables[type as keyof ISecretRotationData][keyName];
};

const secretRotationHttpFn = async (
  func: THttpProviderFunction,
  variables: ISecretRotationData
) => {
  // string interpolation
  const headers = interpolate(func.header, getInterpolationValue(variables));
  const url = interpolate(func.url, getInterpolationValue(variables));
  const body = interpolate(func.body, getInterpolationValue(variables));
  // axios will automatically throw error if req status is not between 2xx range
  return axios({ method: func.method, url, headers, data: body });
};

const secretRotationDbFn = async (func: TDbProviderFunction, variables: ISecretRotationData) => {
  const { type, client, pre, ...dbConnection } = func;
  const { username, password, host, database, port, query, ca } = interpolate(
    dbConnection,
    getInterpolationValue(variables)
  );
  const ssl = ca ? { rejectUnauthorized: false, ca } : undefined;
  if (host === "localhost" || host === "127.0.0.1") throw new Error("Invalid db host");
  if (client === TDbProviderClients.Pg) {
    const pgClient = new PgClient({ user: username, password, host, database, port, ssl });
    await pgClient.connect();
    const res = await pgClient.query(query);
    await pgClient.end();
    return res.rows[0];
  } else if (client === TDbProviderClients.Sql) {
    const sqlClient = mysql.createPool({
      user: username,
      password,
      host,
      database,
      port,
      connectionLimit: 1,
      ssl
    });
    const res = await new Promise((resolve, reject) => {
      sqlClient.query(query, (err, data) => {
        if (err) return reject(err);
        resolve(data);
      });
    });
    await new Promise((resolve, reject) => {
      sqlClient.end(function (err) {
        if (err) return reject(err);
        return resolve({});
      });
    });
    return (res as any)?.[0];
  }
};

const secretRotationPreSetFn = (
  op: Record<string, TDirectAssignOp>,
  variables: ISecretRotationData
) => {
  const getValFn = getInterpolationValue(variables);
  Object.entries(op || {}).forEach(([key, assignFn]) => {
    const [type, keyName] = key.split(".") as [keyof ISecretRotationData, string];
    variables[type][keyName] = interpolate(assignFn.value, getValFn);
  });
};

const secretRotationSetFn = async (func: TProviderFunction, variables: ISecretRotationData) => {
  const getValFn = getInterpolationValue(variables);
  // http setter
  if (func.type === TProviderFunctionTypes.HTTP) {
    const res = await secretRotationHttpFn(func, variables);
    Object.entries(func.setter || {}).forEach(([key, assignFn]) => {
      const [type, keyName] = key.split(".") as [keyof ISecretRotationData, string];
      if (assignFn.assign === TAssignOp.JmesPath) {
        variables[type][keyName] = jmespath.search(res.data, assignFn.path);
      } else if (assignFn.value) {
        variables[type][keyName] = interpolate(assignFn.value, getValFn);
      }
    });
    // db setter
  } else if (func.type === TProviderFunctionTypes.DB) {
    const data = await secretRotationDbFn(func, variables);
    Object.entries(func.setter || {}).forEach(([key, assignFn]) => {
      const [type, keyName] = key.split(".") as [keyof ISecretRotationData, string];
      if (assignFn.assign === TAssignOp.JmesPath) {
        if (typeof data === "object") {
          variables[type][keyName] = jmespath.search(data, assignFn.path);
        }
      } else if (assignFn.value) {
        variables[type][keyName] = interpolate(assignFn.value, getValFn);
      }
    });
  }
};

const secretRotationTestFn = async (func: TProviderFunction, variables: ISecretRotationData) => {
  if (func.type === TProviderFunctionTypes.HTTP) {
    await secretRotationHttpFn(func, variables);
  } else if (func.type === TProviderFunctionTypes.DB) {
    await secretRotationDbFn(func, variables);
  }
};

const secretRotationRemoveFn = async (func: TProviderFunction, variables: ISecretRotationData) => {
  if (!func) return;
  if (func.type === TProviderFunctionTypes.HTTP) {
    // string interpolation
    return await secretRotationHttpFn(func, variables);
  }
};

secretRotationQueue.process(async (job: Job) => {
  const rotationStratDocId = job.data.rotationDocId;
  const secretRotation = await SecretRotation.findById(rotationStratDocId)
    .select("+encryptedData +encryptedDataTag +encryptedDataIV")
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
    console.error(err);
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
