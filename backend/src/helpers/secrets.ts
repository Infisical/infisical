import { Types } from "mongoose";
import {
  CreateSecretBatchParams,
  CreateSecretParams,
  DeleteSecretBatchParams,
  DeleteSecretParams,
  GetSecretParams,
  GetSecretsParams,
  UpdateSecretBatchParams,
  UpdateSecretParams
} from "../interfaces/services/SecretService";
import {
  Folder,
  ISecret,
  IServiceTokenData,
  Secret,
  SecretBlindIndexData,
  ServiceTokenData,
  TFolderRootSchema
} from "../models";
import { EventType, SecretVersion } from "../ee/models";
import {
  BadRequestError,
  InternalServerError,
  SecretBlindIndexDataNotFoundError,
  SecretNotFoundError,
  UnauthorizedRequestError
} from "../utils/errors";
import {
  ALGORITHM_AES_256_GCM,
  ENCODING_SCHEME_BASE64,
  ENCODING_SCHEME_UTF8,
  K8_USER_AGENT_NAME,
  SECRET_PERSONAL,
  SECRET_SHARED
} from "../variables";
import crypto from "crypto";
import * as argon2 from "argon2";
import {
  decryptSymmetric128BitHexKeyUTF8,
  encryptSymmetric128BitHexKeyUTF8
} from "../utils/crypto";
import { TelemetryService } from "../services";
import { client, getEncryptionKey, getRootEncryptionKey } from "../config";
import { EEAuditLogService, EESecretService } from "../ee/services";
import { getAuthDataPayloadUserObj } from "../utils/authn/helpers";
import { getFolderByPath, getFolderIdFromServiceToken } from "../services/FolderService";
import picomatch from "picomatch";
import path from "path";
import { getAnImportedSecret } from "../services/SecretImportService";

/**
 * Validate scope for service token v2
 * @param authPayload
 * @param environment
 * @param secretPath
 * @returns
 */
export const isValidScope = (
  authPayload: IServiceTokenData,
  environment: string,
  secretPath: string
) => {
  const { scopes: tkScopes } = authPayload;
  const validScope = tkScopes.find(
    (scope) =>
      picomatch.isMatch(secretPath, scope.secretPath, { strictSlashes: false }) &&
      scope.environment === environment
  );

  return Boolean(validScope);
};

export function containsGlobPatterns(secretPath: string) {
  const globChars = ["*", "?", "[", "]", "{", "}", "**"];
  const normalizedPath = path.normalize(secretPath);
  return globChars.some((char) => normalizedPath.includes(char));
}

const ERR_FOLDER_NOT_FOUND = BadRequestError({ message: "Folder not found" });

/**
 * Returns an object containing secret [secret] but with its value, key, comment decrypted.
 *
 * Precondition: the workspace for secret [secret] must have E2EE disabled
 * @param {ISecret} secret - secret to repackage to raw
 * @param {String} key - symmetric key to use to decrypt secret
 * @returns
 */
export const repackageSecretToRaw = ({ secret, key }: { secret: ISecret; key: string }) => {
  const secretKey = decryptSymmetric128BitHexKeyUTF8({
    ciphertext: secret.secretKeyCiphertext,
    iv: secret.secretKeyIV,
    tag: secret.secretKeyTag,
    key
  });

  const secretValue = decryptSymmetric128BitHexKeyUTF8({
    ciphertext: secret.secretValueCiphertext,
    iv: secret.secretValueIV,
    tag: secret.secretValueTag,
    key
  });

  let secretComment = "";

  if (secret.secretCommentCiphertext && secret.secretCommentIV && secret.secretCommentTag) {
    secretComment = decryptSymmetric128BitHexKeyUTF8({
      ciphertext: secret.secretCommentCiphertext,
      iv: secret.secretCommentIV,
      tag: secret.secretCommentTag,
      key
    });
  }

  return {
    _id: secret._id,
    version: secret.version,
    workspace: secret.workspace,
    type: secret.type,
    environment: secret.environment,
    user: secret.user,
    secretKey,
    secretValue,
    secretComment
  };
};

/**
 * Create secret blind index data containing encrypted blind index [salt]
 * for workspace with id [workspaceId]
 * @param {Object} obj
 * @param {Types.ObjectId} obj.workspaceId
 */
export const createSecretBlindIndexDataHelper = async ({
  workspaceId
}: {
  workspaceId: Types.ObjectId;
}) => {
  // initialize random blind index salt for workspace
  const salt = crypto.randomBytes(16).toString("base64");

  const encryptionKey = await getEncryptionKey();
  const rootEncryptionKey = await getRootEncryptionKey();

  if (rootEncryptionKey) {
    const {
      ciphertext: encryptedSaltCiphertext,
      iv: saltIV,
      tag: saltTag
    } = client.encryptSymmetric(salt, rootEncryptionKey);

    return await new SecretBlindIndexData({
      workspace: workspaceId,
      encryptedSaltCiphertext,
      saltIV,
      saltTag,
      algorithm: ALGORITHM_AES_256_GCM,
      keyEncoding: ENCODING_SCHEME_BASE64
    }).save();
  } else {
    const {
      ciphertext: encryptedSaltCiphertext,
      iv: saltIV,
      tag: saltTag
    } = encryptSymmetric128BitHexKeyUTF8({
      plaintext: salt,
      key: encryptionKey
    });

    return await new SecretBlindIndexData({
      workspace: workspaceId,
      encryptedSaltCiphertext,
      saltIV,
      saltTag,
      algorithm: ALGORITHM_AES_256_GCM,
      keyEncoding: ENCODING_SCHEME_UTF8
    }).save();
  }
};

/**
 * Get secret blind index salt for workspace with id [workspaceId]
 * @param {Object} obj
 * @param {Types.ObjectId} obj.workspaceId - id of workspace to get salt for
 * @returns
 */
export const getSecretBlindIndexSaltHelper = async ({
  workspaceId
}: {
  workspaceId: Types.ObjectId;
}) => {
  const encryptionKey = await getEncryptionKey();
  const rootEncryptionKey = await getRootEncryptionKey();

  const secretBlindIndexData = await SecretBlindIndexData.findOne({
    workspace: workspaceId
  }).select("+algorithm +keyEncoding");

  if (!secretBlindIndexData) throw SecretBlindIndexDataNotFoundError();

  if (rootEncryptionKey && secretBlindIndexData.keyEncoding === ENCODING_SCHEME_BASE64) {
    return client.decryptSymmetric(
      secretBlindIndexData.encryptedSaltCiphertext,
      rootEncryptionKey,
      secretBlindIndexData.saltIV,
      secretBlindIndexData.saltTag
    );
  } else if (encryptionKey && secretBlindIndexData.keyEncoding === ENCODING_SCHEME_UTF8) {
    // decrypt workspace salt
    return decryptSymmetric128BitHexKeyUTF8({
      ciphertext: secretBlindIndexData.encryptedSaltCiphertext,
      iv: secretBlindIndexData.saltIV,
      tag: secretBlindIndexData.saltTag,
      key: encryptionKey
    });
  }

  throw InternalServerError({
    message: "Failed to obtain workspace salt needed for secret blind indexing"
  });
};

/**
 * Generate blind index for secret with name [secretName]
 * and salt [salt]
 * @param {Object} obj
 * @param {String} obj.secretName - name of secret to generate blind index for
 * @param {String} obj.salt - base64-salt
 */
export const generateSecretBlindIndexWithSaltHelper = async ({
  secretName,
  salt
}: {
  secretName: string;
  salt: string;
}) => {
  // generate secret blind index
  const secretBlindIndex = (
    await argon2.hash(secretName, {
      type: argon2.argon2id,
      salt: Buffer.from(salt, "base64"),
      saltLength: 16, // default 16 bytes
      memoryCost: 65536, // default pool of 64 MiB per thread.
      hashLength: 32,
      parallelism: 1,
      raw: true
    })
  ).toString("base64");

  return secretBlindIndex;
};

/**
 * Generate blind index for secret with name [secretName]
 * for workspace with id [workspaceId]
 * @param {Object} obj
 * @param {Stringj} obj.secretName - name of secret to generate blind index for
 * @param {Types.ObjectId} obj.workspaceId - id of workspace that secret belongs to
 */
export const generateSecretBlindIndexHelper = async ({
  secretName,
  workspaceId
}: {
  secretName: string;
  workspaceId: Types.ObjectId;
}) => {
  // check if workspace blind index data exists
  const encryptionKey = await getEncryptionKey();
  const rootEncryptionKey = await getRootEncryptionKey();

  const secretBlindIndexData = await SecretBlindIndexData.findOne({
    workspace: workspaceId
  }).select("+algorithm +keyEncoding");

  if (!secretBlindIndexData) throw SecretBlindIndexDataNotFoundError();

  let salt;
  if (rootEncryptionKey && secretBlindIndexData.keyEncoding === ENCODING_SCHEME_BASE64) {
    salt = client.decryptSymmetric(
      secretBlindIndexData.encryptedSaltCiphertext,
      rootEncryptionKey,
      secretBlindIndexData.saltIV,
      secretBlindIndexData.saltTag
    );

    const secretBlindIndex = await generateSecretBlindIndexWithSaltHelper({
      secretName,
      salt
    });

    return secretBlindIndex;
  } else if (encryptionKey && secretBlindIndexData.keyEncoding === ENCODING_SCHEME_UTF8) {
    // decrypt workspace salt
    salt = decryptSymmetric128BitHexKeyUTF8({
      ciphertext: secretBlindIndexData.encryptedSaltCiphertext,
      iv: secretBlindIndexData.saltIV,
      tag: secretBlindIndexData.saltTag,
      key: encryptionKey
    });

    const secretBlindIndex = await generateSecretBlindIndexWithSaltHelper({
      secretName,
      salt
    });

    return secretBlindIndex;
  }

  throw InternalServerError({
    message: "Failed to generate secret blind index"
  });
};

/**
 * Create secret with name [secretName]
 * @param {Object} obj
 * @param {String} obj.secretName - name of secret to create
 * @param {Types.ObjectId} obj.workspaceId - id of workspace to create secret for
 * @param {String} obj.environment - environment in workspace to create secret for
 * @param {'shared' | 'personal'} obj.type - type of secret
 * @param {AuthData} obj.authData - authentication data on request
 * @returns
 */
export const createSecretHelper = async ({
  secretName,
  workspaceId,
  environment,
  type,
  authData,
  secretKeyCiphertext,
  secretKeyIV,
  secretKeyTag,
  secretValueCiphertext,
  secretValueIV,
  secretValueTag,
  secretCommentCiphertext,
  secretCommentIV,
  secretCommentTag,
  secretPath = "/",
  metadata,
  skipMultilineEncoding
}: CreateSecretParams) => {
  const secretBlindIndex = await generateSecretBlindIndexHelper({
    secretName,
    workspaceId: new Types.ObjectId(workspaceId)
  });

  // if using service token filter towards the folderId by secretpath
  if (authData.authPayload instanceof ServiceTokenData) {
    if (!isValidScope(authData.authPayload, environment, secretPath)) {
      throw UnauthorizedRequestError({ message: "Folder Permission Denied" });
    }
  }
  const folderId = await getFolderIdFromServiceToken(workspaceId, environment, secretPath);

  const exists = await Secret.exists({
    secretBlindIndex,
    workspace: new Types.ObjectId(workspaceId),
    folder: folderId,
    type,
    environment,
    ...(type === SECRET_PERSONAL ? getAuthDataPayloadUserObj(authData) : {})
  });

  if (exists)
    throw BadRequestError({
      message: "Failed to create secret that already exists"
    });

  if (type === SECRET_PERSONAL) {
    // case: secret type is personal -> check if a corresponding shared secret
    // with the same blind index [secretBlindIndex] exists

    const exists = await Secret.exists({
      secretBlindIndex,
      folder: folderId,
      workspace: new Types.ObjectId(workspaceId),
      environment,
      type: SECRET_SHARED
    });

    if (!exists)
      throw BadRequestError({
        message: "Failed to create personal secret override for no corresponding shared secret"
      });
  }

  // create secret
  const secret = await new Secret({
    version: 1,
    workspace: new Types.ObjectId(workspaceId),
    environment,
    type,
    ...(type === SECRET_PERSONAL ? getAuthDataPayloadUserObj(authData) : {}),
    secretBlindIndex,
    secretKeyCiphertext,
    secretKeyIV,
    secretKeyTag,
    secretValueCiphertext,
    secretValueIV,
    secretValueTag,
    secretCommentCiphertext,
    secretCommentIV,
    secretCommentTag,
    skipMultilineEncoding,
    folder: folderId,
    algorithm: ALGORITHM_AES_256_GCM,
    keyEncoding: ENCODING_SCHEME_UTF8,
    metadata
  }).save();

  const secretVersion = new SecretVersion({
    secret: secret._id,
    version: secret.version,
    workspace: secret.workspace,
    type,
    folder: folderId,
    ...(type === SECRET_PERSONAL ? getAuthDataPayloadUserObj(authData) : {}),
    environment: secret.environment,
    isDeleted: false,
    secretBlindIndex,
    secretKeyCiphertext,
    secretKeyIV,
    secretKeyTag,
    secretValueCiphertext,
    secretValueIV,
    secretValueTag,
    skipMultilineEncoding,
    algorithm: ALGORITHM_AES_256_GCM,
    keyEncoding: ENCODING_SCHEME_UTF8
  });

  // (EE) add version for new secret
  await EESecretService.addSecretVersions({
    secretVersions: [secretVersion]
  });

  await EEAuditLogService.createAuditLog(
    authData,
    {
      type: EventType.CREATE_SECRET,
      metadata: {
        environment,
        secretPath,
        secretId: secret._id.toString(),
        secretKey: secretName,
        secretVersion: secret.version
      }
    },
    {
      workspaceId
    }
  );

  // (EE) take a secret snapshot
  await EESecretService.takeSecretSnapshot({
    workspaceId,
    environment,
    folderId
  });

  const postHogClient = await TelemetryService.getPostHogClient();

  if (postHogClient && metadata?.source !== "signup") {
    postHogClient.capture({
      event: "secrets added",
      distinctId: await TelemetryService.getDistinctId({
        authData
      }),
      properties: {
        numberOfSecrets: 1,
        environment,
        workspaceId,
        folderId,
        channel: authData.userAgentType,
        userAgent: authData.userAgent
      }
    });
  }

  return secret;
};

/**
 * Get secrets for workspace with id [workspaceId] and environment [environment]
 * @param {Object} obj
 * @param {Types.ObjectId} obj.workspaceId - id of workspace
 * @param {String} obj.environment - environment in workspace
 * @param {AuthData} obj.authData - authentication data on request
 * @returns
 */
export const getSecretsHelper = async ({
  workspaceId,
  environment,
  authData,
  secretPath = "/"
}: GetSecretsParams) => {
  let secrets: ISecret[] = [];
  // if using service token filter towards the folderId by secretpath

  const folders = await Folder.findOne({
    workspace: workspaceId,
    environment
  });
  let folderId = "root";
  if (!folders && folderId !== "root") return [];
  // get folder from folder tree
  if (folders) {
    const folder = getFolderByPath(folders.nodes, secretPath);
    if (!folder) return [];
    folderId = folder?.id;
  }

  // get personal secrets first
  secrets = await Secret.find({
    workspace: new Types.ObjectId(workspaceId),
    environment,
    folder: folderId,
    type: SECRET_PERSONAL,
    ...getAuthDataPayloadUserObj(authData)
  })
    .populate("tags")
    .lean();

  // concat with shared secrets
  secrets = secrets.concat(
    await Secret.find({
      workspace: new Types.ObjectId(workspaceId),
      environment,
      folder: folderId,
      type: SECRET_SHARED,
      secretBlindIndex: {
        $nin: secrets.map((secret) => secret.secretBlindIndex)
      }
    })
      .populate("tags")
      .lean()
  );

  await EEAuditLogService.createAuditLog(
    authData,
    {
      type: EventType.GET_SECRETS,
      metadata: {
        environment,
        secretPath,
        numberOfSecrets: secrets.length
      }
    },
    {
      workspaceId
    }
  );

  const postHogClient = await TelemetryService.getPostHogClient();

  // reduce the number of events captured
  let shouldRecordK8Event = false;
  if (authData.userAgent == K8_USER_AGENT_NAME) {
    const randomNumber = Math.random();
    if (randomNumber > 0.9) {
      shouldRecordK8Event = true;
    }
  }

  const numberOfSignupSecrets = secrets.filter(
    (secret) => secret?.metadata?.source === "signup"
  ).length;
  const atLeastOneNonSignUpSecret = secrets.length - numberOfSignupSecrets > 0;

  if (postHogClient && atLeastOneNonSignUpSecret) {
    const shouldCapture = authData.userAgent !== K8_USER_AGENT_NAME || shouldRecordK8Event;
    const approximateForNoneCapturedEvents = secrets.length * 10;

    if (shouldCapture) {
      if (workspaceId.toString() != "650e71fbae3e6c8572f436d4") {
        postHogClient.capture({
          event: "secrets pulled",
          distinctId: await TelemetryService.getDistinctId({ authData }),
          properties: {
            numberOfSecrets: shouldRecordK8Event ? approximateForNoneCapturedEvents : secrets.length,
            environment,
            workspaceId,
            folderId,
            channel: authData.userAgentType,
            userAgent: authData.userAgent
          }
        });
      }
    }
  }

  return secrets;
};

/**
 * Get secret with name [secretName]
 * @param {Object} obj
 * @param {String} obj.secretName - name of secret to get
 * @param {Types.ObjectId} obj.workspaceId - id of workspace that secret belongs to
 * @param {String} obj.environment - environment in workspace that secret belongs to
 * @param {'shared' | 'personal'} obj.type - type of secret
 * @param {AuthData} obj.authData - authentication data on request
 * @returns
 */
export const getSecretHelper = async ({
  secretName,
  workspaceId,
  environment,
  type,
  authData,
  secretPath = "/",
  include_imports = true
}: GetSecretParams) => {
  const secretBlindIndex = await generateSecretBlindIndexHelper({
    secretName,
    workspaceId: new Types.ObjectId(workspaceId)
  });
  let secret: ISecret | null | undefined = null;
  // if using service token filter towards the folderId by secretpath

  const folderId = await getFolderIdFromServiceToken(workspaceId, environment, secretPath);

  // try getting personal secret first (if exists)
  secret = await Secret.findOne({
    secretBlindIndex,
    workspace: new Types.ObjectId(workspaceId),
    environment,
    folder: folderId,
    type: type ?? SECRET_PERSONAL,
    ...(type === SECRET_PERSONAL ? getAuthDataPayloadUserObj(authData) : {})
  }).lean();

  if (!secret) {
    // case: failed to find personal secret matching criteria
    // -> find shared secret matching criteria
    secret = await Secret.findOne({
      secretBlindIndex,
      workspace: new Types.ObjectId(workspaceId),
      environment,
      folder: folderId,
      type: SECRET_SHARED
    }).lean();
  }

  if (!secret && include_imports) {
    // if still no secret found search in imported secret and retreive
    secret = await getAnImportedSecret(secretName, workspaceId.toString(), environment, folderId);
  }

  if (!secret) throw SecretNotFoundError();

  await EEAuditLogService.createAuditLog(
    authData,
    {
      type: EventType.GET_SECRET,
      metadata: {
        environment,
        secretPath,
        secretId: secret._id.toString(),
        secretKey: secretName,
        secretVersion: secret.version
      }
    },
    {
      workspaceId
    }
  );

  const postHogClient = await TelemetryService.getPostHogClient();

  if (postHogClient) {
    postHogClient.capture({
      event: "secrets pulled",
      distinctId: await TelemetryService.getDistinctId({
        authData
      }),
      properties: {
        numberOfSecrets: 1,
        environment,
        workspaceId,
        folderId,
        channel: authData.userAgentType,
        userAgent: authData.userAgent
      }
    });
  }

  return secret;
};

/**
 * Update secret with name [secretName]
 * @param {Object} obj
 * @param {String} obj.secretName - name of secret to update
 * @param {Types.ObjectId} obj.workspaceId - id of workspace that secret belongs to
 * @param {String} obj.environment - environment in workspace that secret belongs to
 * @param {'shared' | 'personal'} obj.type - type of secret
 * @param {String} obj.secretValueCiphertext - ciphertext of secret value
 * @param {String} obj.secretValueIV - IV of secret value
 * @param {String} obj.secretValueTag - tag of secret value
 * @param {AuthData} obj.authData - authentication data on request
 * @returns
 */

export const updateSecretHelper = async ({
  secretName,
  workspaceId,
  secretId,
  environment,
  type,
  authData,
  newSecretName,
  secretKeyTag,
  secretKeyCiphertext,
  secretKeyIV,
  secretValueCiphertext,
  secretValueIV,
  secretValueTag,
  secretPath,
  secretReminderRepeatDays,
  secretReminderNote,
  tags,
  secretCommentCiphertext,
  secretCommentIV,
  secretCommentTag,
  skipMultilineEncoding
}: UpdateSecretParams) => {
  // get secret blind index salt
  const salt = await getSecretBlindIndexSaltHelper({
    workspaceId: new Types.ObjectId(workspaceId)
  });

  let oldSecretBlindIndex = await generateSecretBlindIndexWithSaltHelper({
    secretName,
    salt
  });

  if (secretId) {
    const secret = await Secret.findOne({
      workspace: workspaceId,
      environment,
      _id: secretId
    }).select("secretBlindIndex");
    if (secret && secret.secretBlindIndex) oldSecretBlindIndex = secret.secretBlindIndex;
  }

  let secret: ISecret | null = null;
  const folderId = await getFolderIdFromServiceToken(workspaceId, environment, secretPath);

  let newSecretNameBlindIndex = undefined;
  if (newSecretName) {
    newSecretNameBlindIndex = await generateSecretBlindIndexWithSaltHelper({
      secretName: newSecretName,
      salt
    });
    const doesSecretAlreadyExist = await Secret.exists({
      secretBlindIndex: newSecretNameBlindIndex,
      workspace: new Types.ObjectId(workspaceId),
      environment,
      folder: folderId,
      type
    });

    if (doesSecretAlreadyExist) {
      throw BadRequestError({ message: "Secret with the provided name already exist" });
    }
  }

  if (type === SECRET_SHARED) {
    // case: update shared secret
    secret = await Secret.findOneAndUpdate(
      {
        secretBlindIndex: oldSecretBlindIndex,
        workspace: new Types.ObjectId(workspaceId),
        environment,
        folder: folderId,
        type
      },
      {
        secretValueCiphertext,
        secretValueIV,
        secretValueTag,
        secretCommentIV,
        secretCommentTag,
        secretCommentCiphertext,

        secretReminderRepeatDays,
        secretReminderNote,

        skipMultilineEncoding,
        secretBlindIndex: newSecretNameBlindIndex,
        secretKeyIV,
        secretKeyTag,
        secretKeyCiphertext,
        tags,
        $inc: { version: 1 }
      },
      {
        new: true
      }
    );
  } else {
    // case: update personal secret

    secret = await Secret.findOneAndUpdate(
      {
        secretBlindIndex: oldSecretBlindIndex,
        workspace: new Types.ObjectId(workspaceId),
        environment,
        type,
        folder: folderId,
        ...getAuthDataPayloadUserObj(authData)
      },
      {
        secretValueCiphertext,
        secretValueIV,
        secretValueTag,
        secretKeyIV,
        secretKeyTag,
        secretKeyCiphertext,
        tags,
        skipMultilineEncoding,
        secretBlindIndex: newSecretNameBlindIndex,
        $inc: { version: 1 }
      },
      {
        new: true
      }
    );
  }

  if (!secret) throw SecretNotFoundError();

  const secretVersion = new SecretVersion({
    secret: secret._id,
    version: secret.version,
    workspace: secret.workspace,
    folder: folderId,
    type,
    tags,
    ...(type === SECRET_PERSONAL ? getAuthDataPayloadUserObj(authData) : {}),
    environment: secret.environment,
    isDeleted: false,
    secretBlindIndex: newSecretName ? newSecretNameBlindIndex : oldSecretBlindIndex,
    secretKeyCiphertext: secret.secretKeyCiphertext,
    secretKeyIV: secret.secretKeyIV,
    secretKeyTag: secret.secretKeyTag,
    secretValueCiphertext,
    secretValueIV,
    secretValueTag,
    skipMultilineEncoding,
    algorithm: ALGORITHM_AES_256_GCM,
    keyEncoding: ENCODING_SCHEME_UTF8
  });

  // (EE) add version for new secret
  await EESecretService.addSecretVersions({
    secretVersions: [secretVersion]
  });

  await EEAuditLogService.createAuditLog(
    authData,
    {
      type: EventType.UPDATE_SECRET,
      metadata: {
        environment,
        secretPath,
        secretId: secret._id.toString(),
        secretKey: secretName,
        secretVersion: secret.version
      }
    },
    {
      workspaceId
    }
  );

  // (EE) take a secret snapshot
  await EESecretService.takeSecretSnapshot({
    workspaceId,
    environment,
    folderId: secret?.folder
  });

  const postHogClient = await TelemetryService.getPostHogClient();

  if (postHogClient) {
    postHogClient.capture({
      event: "secrets modified",
      distinctId: await TelemetryService.getDistinctId({
        authData
      }),
      properties: {
        numberOfSecrets: 1,
        environment,
        workspaceId,
        folderId,
        channel: authData.userAgentType,
        userAgent: authData.userAgent
      }
    });
  }

  return secret;
};

/**
 * Delete secret with name [secretName]
 * @param {Object} obj
 * @param {String} obj.secretName - name of secret to delete
 * @param {Types.ObjectId} obj.workspaceId - id of workspace that secret belongs to
 * @param {String} obj.environment - environment in workspace that secret belongs to
 * @param {'shared' | 'personal'} obj.type - type of secret
 * @param {AuthData} obj.authData - authentication data on request
 * @returns
 */
export const deleteSecretHelper = async ({
  secretName,
  workspaceId,
  environment,
  type,
  authData,
  secretPath = "/",
  // used for update corner case and blindIndex goes wrong way
  secretId
}: DeleteSecretParams) => {
  let secretBlindIndex = await generateSecretBlindIndexHelper({
    secretName,
    workspaceId: new Types.ObjectId(workspaceId)
  });
  if (secretId) {
    const secret = await Secret.findOne({
      workspace: workspaceId,
      environment,
      _id: secretId
    }).select("secretBlindIndex");
    if (secret && secret.secretBlindIndex) secretBlindIndex = secret.secretBlindIndex;
  }

  const folderId = await getFolderIdFromServiceToken(workspaceId, environment, secretPath);

  let secrets: ISecret[] = [];
  let secret: ISecret | null = null;

  if (type === SECRET_SHARED) {
    secrets = await Secret.find({
      secretBlindIndex,
      workspace: new Types.ObjectId(workspaceId),
      environment,
      folder: folderId
    }).lean();

    secret = await Secret.findOneAndDelete({
      secretBlindIndex,
      workspace: new Types.ObjectId(workspaceId),
      environment,
      type,
      folder: folderId
    }).lean();

    await Secret.deleteMany({
      secretBlindIndex,
      workspaceId: new Types.ObjectId(workspaceId),
      environment,
      folder: folderId
    });
  } else {
    secret = await Secret.findOneAndDelete({
      secretBlindIndex,
      folder: folderId,
      workspace: new Types.ObjectId(workspaceId),
      environment,
      type,
      ...getAuthDataPayloadUserObj(authData)
    }).lean();

    if (secret) {
      secrets = [secret];
    }
  }

  if (!secret) throw SecretNotFoundError();

  await EESecretService.markDeletedSecretVersions({
    secretIds: secrets.map((secret) => secret._id)
  });

  await EEAuditLogService.createAuditLog(
    authData,
    {
      type: EventType.DELETE_SECRET,
      metadata: {
        environment,
        secretPath,
        secretId: secret._id.toString(),
        secretKey: secretName,
        secretVersion: secret.version
      }
    },
    {
      workspaceId
    }
  );

  // (EE) take a secret snapshot
  await EESecretService.takeSecretSnapshot({
    workspaceId,
    environment,
    folderId: secret?.folder
  });

  const postHogClient = await TelemetryService.getPostHogClient();

  if (postHogClient) {
    postHogClient.capture({
      event: "secrets deleted",
      distinctId: await TelemetryService.getDistinctId({
        authData
      }),
      properties: {
        numberOfSecrets: secrets.length,
        environment,
        workspaceId,
        folderId,
        channel: authData.userAgentType,
        userAgent: authData.userAgent
      }
    });
  }

  return {
    secrets,
    secret
  };
};

const fetchSecretsCrossEnv = (workspaceId: string, folders: TFolderRootSchema[], key: string) => {
  const fetchCache: Record<string, Record<string, string>> = {};

  return async (secRefEnv: string, secRefPath: string[], secRefKey: string) => {
    const secRefPathUrl = path.join("/", ...secRefPath);
    const uniqKey = `${secRefEnv}-${secRefPathUrl}`;

    if (fetchCache?.[uniqKey]) {
      return fetchCache[uniqKey][secRefKey];
    }

    let folderId = "root";
    const folder = folders.find(({ environment }) => environment === secRefEnv);
    if (!folder && secRefPathUrl !== "/") {
      throw BadRequestError({ message: "Folder not found" });
    }

    if (folder) {
      const selectedFolder = getFolderByPath(folder.nodes, secRefPathUrl);
      if (!selectedFolder) {
        throw BadRequestError({ message: "Folder not found" });
      }
      folderId = selectedFolder.id;
    }

    const secrets = await Secret.find({
      workspace: workspaceId,
      environment: secRefEnv,
      type: SECRET_SHARED,
      folder: folderId
    });

    const decryptedSec = secrets.reduce<Record<string, string>>((prev, secret) => {
      const secretKey = decryptSymmetric128BitHexKeyUTF8({
        ciphertext: secret.secretKeyCiphertext,
        iv: secret.secretKeyIV,
        tag: secret.secretKeyTag,
        key
      });
      const secretValue = decryptSymmetric128BitHexKeyUTF8({
        ciphertext: secret.secretValueCiphertext,
        iv: secret.secretValueIV,
        tag: secret.secretValueTag,
        key
      });

      prev[secretKey] = secretValue;
      return prev;
    }, {});

    fetchCache[uniqKey] = decryptedSec;

    return fetchCache[uniqKey][secRefKey];
  };
};

const INTERPOLATION_SYNTAX_REG = new RegExp(/\${([^}]+)}/g);
const recursivelyExpandSecret = async (
  expandedSec: Record<string, string>,
  interpolatedSec: Record<string, string>,
  fetchCrossEnv: (env: string, secPath: string[], secKey: string) => Promise<string>,
  recursionChainBreaker: Record<string, boolean>,
  key: string
) => {
  if (expandedSec?.[key]) {
    return expandedSec[key];
  }
  if (recursionChainBreaker?.[key]) {
    return "";
  }
  recursionChainBreaker[key] = true;

  let interpolatedValue = interpolatedSec[key];
  if (!interpolatedValue) {
    // eslint-disable-next-line no-console
    console.error(`Couldn't find referenced value - ${key}`);
    return "";
  }

  const refs = interpolatedValue.match(INTERPOLATION_SYNTAX_REG);
  if (refs) {
    for (const interpolationSyntax of refs) {
      const interpolationKey = interpolationSyntax.slice(2, interpolationSyntax.length - 1);
      const entities = interpolationKey.trim().split(".");

      if (entities.length === 1) {
        const val = await recursivelyExpandSecret(
          expandedSec,
          interpolatedSec,
          fetchCrossEnv,
          recursionChainBreaker,
          interpolationKey
        );
        if (val) {
          interpolatedValue = interpolatedValue.replaceAll(interpolationSyntax, val);
        }
        continue;
      }

      if (entities.length > 1) {
        const secRefEnv = entities[0];
        const secRefPath = entities.slice(1, entities.length - 1);
        const secRefKey = entities[entities.length - 1];

        const val = await fetchCrossEnv(secRefEnv, secRefPath, secRefKey);
        interpolatedValue = interpolatedValue.replaceAll(interpolationSyntax, val);
      }
    }
  }

  expandedSec[key] = interpolatedValue;
  return interpolatedValue;
};

// used to convert multi line ones to quotes ones with \n
const formatMultiValueEnv = (val?: string) => {
  if (!val) return "";
  if (!val.match("\n")) return val;
  return `"${val.replace(/\n/g, "\\n")}"`;
};

export const expandSecrets = async (
  workspaceId: string,
  rootEncKey: string,
  secrets: Record<string, { value: string; comment?: string; skipMultilineEncoding?: boolean }>
) => {
  const expandedSec: Record<string, string> = {};
  const interpolatedSec: Record<string, string> = {};

  const folders = await Folder.find({ workspace: workspaceId });
  const crossSecEnvFetch = fetchSecretsCrossEnv(workspaceId, folders, rootEncKey);

  Object.keys(secrets).forEach((key) => {
    if (secrets[key].value.match(INTERPOLATION_SYNTAX_REG)) {
      interpolatedSec[key] = secrets[key].value;
    } else {
      expandedSec[key] = secrets[key].value;
    }
  });

  for (const key of Object.keys(secrets)) {
    if (expandedSec?.[key]) {
      // should not do multi line encoding if user has set it to skip
      secrets[key].value = secrets[key].skipMultilineEncoding
        ? expandedSec[key]
        : formatMultiValueEnv(expandedSec[key]);
      continue;
    }

    // this is to avoid recursion loop. So the graph should be direct graph rather than cyclic
    // so for any recursion building if there is an entity two times same key meaning it will be looped
    const recursionChainBreaker: Record<string, boolean> = {};
    const expandedVal = await recursivelyExpandSecret(
      expandedSec,
      interpolatedSec,
      crossSecEnvFetch,
      recursionChainBreaker,
      key
    );

    secrets[key].value = secrets[key].skipMultilineEncoding
      ? expandedVal
      : formatMultiValueEnv(expandedVal);
  }

  return secrets;
};

export const createSecretBatchHelper = async ({
  secrets,
  workspaceId,
  authData,
  secretPath,
  environment
}: CreateSecretBatchParams) => {
  let folderId = "root";
  const folders = await Folder.findOne({
    workspace: workspaceId,
    environment
  });

  if (!folders && secretPath !== "/") throw ERR_FOLDER_NOT_FOUND;
  if (folders) {
    const folder = getFolderByPath(folders.nodes, secretPath);
    if (!folder) throw ERR_FOLDER_NOT_FOUND;
    folderId = folder.id;
  }

  // get secret blind index salt
  const salt = await getSecretBlindIndexSaltHelper({
    workspaceId: new Types.ObjectId(workspaceId)
  });

  const secretBlindIndexToKey: Record<string, string> = {}; // used at audit log point
  const secretBlindIndexes = await Promise.all(
    secrets.map(({ secretName }) =>
      generateSecretBlindIndexWithSaltHelper({
        secretName,
        salt
      })
    )
  ).then((blindIndexes) =>
    blindIndexes.reduce<Record<string, string>>((prev, curr, i) => {
      prev[secrets[i].secretName] = curr;
      secretBlindIndexToKey[curr] = secrets[i].secretName;
      return prev;
    }, {})
  );

  const exists = await Secret.exists({
    workspace: new Types.ObjectId(workspaceId),
    folder: folderId,
    environment
  })
    .or(
      secrets.map(({ secretName, type }) => ({
        secretBlindIndex: secretBlindIndexes[secretName],
        type: type,
        ...(type === SECRET_PERSONAL ? getAuthDataPayloadUserObj(authData) : {})
      }))
    )
    .exec();

  if (exists)
    throw BadRequestError({
      message: "Failed to create secret that already exists"
    });

  // create secret
  const newlyCreatedSecrets: ISecret[] = await Secret.insertMany(
    secrets.map(
      ({
        type,
        secretName,
        secretKeyIV,
        metadata,
        secretKeyTag,
        secretValueIV,
        secretValueTag,
        secretCommentIV,
        secretCommentTag,
        secretKeyCiphertext,
        secretValueCiphertext,
        secretCommentCiphertext,
        skipMultilineEncoding
      }) => ({
        version: 1,
        workspace: new Types.ObjectId(workspaceId),
        environment,
        type,
        secretKeyCiphertext,
        secretKeyIV,
        secretKeyTag,
        secretValueCiphertext,
        secretValueIV,
        secretValueTag,
        secretCommentCiphertext,
        secretCommentIV,
        secretCommentTag,
        folder: folderId,
        algorithm: ALGORITHM_AES_256_GCM,
        keyEncoding: ENCODING_SCHEME_UTF8,
        metadata,
        skipMultilineEncoding,
        secretBlindIndex: secretBlindIndexes[secretName],
        ...(type === SECRET_PERSONAL ? getAuthDataPayloadUserObj(authData) : {})
      })
    )
  );

  await EESecretService.addSecretVersions({
    secretVersions: newlyCreatedSecrets.map(
      (secret) =>
        new SecretVersion({
          secret: secret._id,
          version: secret.version,
          workspace: secret.workspace,
          type: secret.type,
          folder: folderId,
          skipMultilineEncoding: secret?.skipMultilineEncoding,
          ...(secret.type === SECRET_PERSONAL ? getAuthDataPayloadUserObj(authData) : {}),
          environment: secret.environment,
          isDeleted: false,
          secretBlindIndex: secret.secretBlindIndex,
          secretKeyCiphertext: secret.secretKeyCiphertext,
          secretKeyIV: secret.secretKeyIV,
          secretKeyTag: secret.secretKeyTag,
          secretValueCiphertext: secret.secretValueCiphertext,
          secretValueIV: secret.secretValueIV,
          secretValueTag: secret.secretValueTag,
          algorithm: ALGORITHM_AES_256_GCM,
          keyEncoding: ENCODING_SCHEME_UTF8
        })
    )
  });

  await EEAuditLogService.createAuditLog(
    authData,
    {
      type: EventType.CREATE_SECRETS,
      metadata: {
        environment,
        secretPath,
        secrets: newlyCreatedSecrets.map(({ secretBlindIndex, version, _id }) => ({
          secretId: _id.toString(),
          secretKey: secretBlindIndexToKey[secretBlindIndex || ""],
          secretVersion: version
        }))
      }
    },
    {
      workspaceId
    }
  );

  // (EE) take a secret snapshot
  await EESecretService.takeSecretSnapshot({
    workspaceId,
    environment,
    folderId
  });

  const postHogClient = await TelemetryService.getPostHogClient();

  if (postHogClient) {
    postHogClient.capture({
      event: "secrets added",
      distinctId: await TelemetryService.getDistinctId({
        authData
      }),
      properties: {
        numberOfSecrets: 1,
        environment,
        workspaceId,
        folderId,
        channel: authData.userAgentType,
        userAgent: authData.userAgent
      }
    });
  }

  return newlyCreatedSecrets;
};

export const updateSecretBatchHelper = async ({
  workspaceId,
  environment,
  authData,
  secretPath,
  secrets
}: UpdateSecretBatchParams) => {
  let folderId = "root";
  const folders = await Folder.findOne({
    workspace: workspaceId,
    environment
  });

  if (!folders && secretPath !== "/") throw ERR_FOLDER_NOT_FOUND;
  if (folders) {
    const folder = getFolderByPath(folders.nodes, secretPath);
    if (!folder) throw ERR_FOLDER_NOT_FOUND;
    folderId = folder.id;
  }

  // get secret blind index salt
  const salt = await getSecretBlindIndexSaltHelper({
    workspaceId: new Types.ObjectId(workspaceId)
  });

  const secretBlindIndexToKey: Record<string, string> = {}; // used at audit log point
  const secretBlindIndexes = await Promise.all(
    secrets.map(({ secretName }) =>
      generateSecretBlindIndexWithSaltHelper({
        secretName,
        salt
      })
    )
  ).then((blindIndexes) =>
    blindIndexes.reduce<Record<string, string>>((prev, curr, i) => {
      prev[secrets[i].secretName] = curr;
      secretBlindIndexToKey[curr] = secrets[i].secretName;
      return prev;
    }, {})
  );

  const secretsToBeUpdated = await Secret.find({
    workspace: new Types.ObjectId(workspaceId),
    folder: folderId,
    environment
  })
    .select("+secretBlindIndex")
    .or(
      secrets.map(({ secretName, type }) => ({
        secretBlindIndex: secretBlindIndexes[secretName],
        type: type,
        ...(type === SECRET_PERSONAL ? getAuthDataPayloadUserObj(authData) : {})
      }))
    )
    .lean();

  if (secretsToBeUpdated.length !== secrets.length)
    throw BadRequestError({ message: "Some secrets not found" });

  await Secret.bulkWrite(
    secrets.map(
      ({
        type,
        secretName,
        tags,
        secretValueIV,
        secretValueTag,
        secretCommentIV,
        secretCommentTag,
        secretValueCiphertext,
        secretCommentCiphertext,
        skipMultilineEncoding
      }) => ({
        updateOne: {
          filter: {
            workspace: new Types.ObjectId(workspaceId),
            environment,
            folder: folderId,
            secretBlindIndex: secretBlindIndexes[secretName],
            type,
            ...(type === SECRET_PERSONAL ? getAuthDataPayloadUserObj(authData) : {})
          },
          update: {
            $inc: {
              version: 1
            },
            secretValueCiphertext,
            secretValueIV,
            secretValueTag,
            secretCommentCiphertext,
            secretCommentIV,
            secretCommentTag,
            algorithm: ALGORITHM_AES_256_GCM,
            keyEncoding: ENCODING_SCHEME_UTF8,
            tags,
            skipMultilineEncoding
          }
        }
      })
    )
  );

  const secretsGroupedByBlindIndex = secretsToBeUpdated.reduce<Record<string, ISecret>>(
    (prev, curr) => {
      if (curr.secretBlindIndex) prev[curr.secretBlindIndex] = curr;
      return prev;
    },
    {}
  );

  await EESecretService.addSecretVersions({
    secretVersions: secrets.map((secret) => {
      const {
        _id,
        version,
        workspace,
        type,
        secretBlindIndex,
        secretKeyIV,
        secretKeyTag,
        secretKeyCiphertext,
        skipMultilineEncoding
      } = secretsGroupedByBlindIndex[secretBlindIndexes[secret.secretName]];

      return new SecretVersion({
        secret: _id,
        version: version + 1,
        workspace: workspace,
        type,
        folder: folderId,
        ...(secret.type === SECRET_PERSONAL ? getAuthDataPayloadUserObj(authData) : {}),
        environment,
        isDeleted: false,
        secretBlindIndex: secretBlindIndex,
        secretKeyCiphertext: secretKeyCiphertext,
        secretKeyIV: secretKeyIV,
        secretKeyTag: secretKeyTag,
        secretValueCiphertext: secret.secretValueCiphertext,
        secretValueIV: secret.secretValueIV,
        secretValueTag: secret.secretValueTag,
        algorithm: ALGORITHM_AES_256_GCM,
        keyEncoding: ENCODING_SCHEME_UTF8,
        skipMultilineEncoding
      });
    })
  });

  await EEAuditLogService.createAuditLog(
    authData,
    {
      type: EventType.UPDATE_SECRETS,
      metadata: {
        environment,
        secretPath,
        secrets: secretsToBeUpdated.map(({ _id, version, secretBlindIndex }) => ({
          secretId: _id.toString(),
          secretKey: secretBlindIndexToKey[secretBlindIndex || ""],
          secretVersion: version + 1
        }))
      }
    },
    {
      workspaceId
    }
  );

  // (EE) take a secret snapshot
  await EESecretService.takeSecretSnapshot({
    workspaceId,
    environment,
    folderId
  });

  const postHogClient = await TelemetryService.getPostHogClient();

  if (postHogClient) {
    postHogClient.capture({
      event: "secrets modified",
      distinctId: await TelemetryService.getDistinctId({
        authData
      }),
      properties: {
        numberOfSecrets: 1,
        environment,
        workspaceId,
        folderId,
        channel: authData.userAgentType,
        userAgent: authData.userAgent
      }
    });
  }

  return;
};

export const deleteSecretBatchHelper = async ({
  workspaceId,
  environment,
  authData,
  secretPath = "/",
  secrets
}: DeleteSecretBatchParams) => {
  let folderId = "root";
  const folders = await Folder.findOne({
    workspace: workspaceId,
    environment
  });

  if (!folders && secretPath !== "/") throw ERR_FOLDER_NOT_FOUND;
  if (folders) {
    const folder = getFolderByPath(folders.nodes, secretPath);
    if (!folder) throw ERR_FOLDER_NOT_FOUND;
    folderId = folder.id;
  }

  // get secret blind index salt
  const salt = await getSecretBlindIndexSaltHelper({
    workspaceId: new Types.ObjectId(workspaceId)
  });

  const secretBlindIndexToKey: Record<string, string> = {}; // used at audit log point
  const secretBlindIndexes = await Promise.all(
    secrets.map(({ secretName }) =>
      generateSecretBlindIndexWithSaltHelper({
        secretName,
        salt
      })
    )
  ).then((blindIndexes) =>
    blindIndexes.reduce<Record<string, string>>((prev, curr, i) => {
      prev[secrets[i].secretName] = curr;
      secretBlindIndexToKey[curr] = secrets[i].secretName;
      return prev;
    }, {})
  );

  const deletedSecrets = await Secret.find({
    workspace: new Types.ObjectId(workspaceId),
    folder: folderId,
    environment
  })
    .or(
      secrets.map(({ secretName, type }) => ({
        secretBlindIndex: secretBlindIndexes[secretName],
        type: type === "shared" ? { $in: ["shared", "personal"] } : type,
        ...(type === SECRET_PERSONAL ? getAuthDataPayloadUserObj(authData) : {})
      }))
    )
    .select({ secretBlindIndexes: 1 })
    .lean()
    .exec();

  await Secret.deleteMany({
    workspace: new Types.ObjectId(workspaceId),
    folder: folderId,
    environment
  })
    .or(
      secrets.map(({ secretName, type }) => ({
        secretBlindIndex: secretBlindIndexes[secretName],
        type: type === "shared" ? { $in: ["shared", "personal"] } : type,
        ...(type === SECRET_PERSONAL ? getAuthDataPayloadUserObj(authData) : {})
      }))
    )
    .exec();

  await EESecretService.markDeletedSecretVersions({
    secretIds: deletedSecrets.map((secret) => secret._id)
  });

  await EEAuditLogService.createAuditLog(
    authData,
    {
      type: EventType.DELETE_SECRETS,
      metadata: {
        environment,
        secretPath,
        secrets: deletedSecrets.map(({ _id, version, secretBlindIndex }) => ({
          secretId: _id.toString(),
          secretKey: secretBlindIndexToKey[secretBlindIndex || ""],
          secretVersion: version
        }))
      }
    },
    {
      workspaceId
    }
  );

  // (EE) take a secret snapshot
  await EESecretService.takeSecretSnapshot({
    workspaceId,
    environment,
    folderId
  });

  const postHogClient = await TelemetryService.getPostHogClient();

  if (postHogClient) {
    postHogClient.capture({
      event: "secrets deleted",
      distinctId: await TelemetryService.getDistinctId({
        authData
      }),
      properties: {
        numberOfSecrets: secrets.length,
        environment,
        workspaceId,
        folderId,
        channel: authData.userAgentType,
        userAgent: authData.userAgent
      }
    });
  }

  return {
    secrets: deletedSecrets
  };
};
