import { Types } from "mongoose";
import {
  Bot,
  BotKey,
  Secret,
  ISecret,
  IUser,
  User,
  IServiceAccount,
  ServiceAccount,
  IServiceTokenData,
  ServiceTokenData,
} from "../models";
import {
  generateKeyPair,
  encryptSymmetric,
  decryptSymmetric,
  decryptAsymmetric,
} from "../utils/crypto";
import {
  SECRET_SHARED,
  AUTH_MODE_JWT,
  AUTH_MODE_SERVICE_ACCOUNT,
  AUTH_MODE_SERVICE_TOKEN,
  AUTH_MODE_API_KEY,
} from "../variables";
import { getEncryptionKey } from "../config";
import { BotNotFoundError, UnauthorizedRequestError } from "../utils/errors";
import { validateMembership } from "../helpers/membership";
import { validateUserClientForWorkspace } from "../helpers/user";
import { validateServiceAccountClientForWorkspace } from "../helpers/serviceAccount";

/**
 * Validate authenticated clients for bot with id [botId] based
 * on any known permissions.
 * @param {Object} obj
 * @param {Object} obj.authData - authenticated client details
 * @param {Types.ObjectId} obj.botId - id of bot to validate against
 * @param {Array<'admin' | 'member'>} obj.acceptedRoles - accepted workspace roles
 */
const validateClientForBot = async ({
  authData,
  botId,
  acceptedRoles,
}: {
  authData: {
    authMode: string;
    authPayload: IUser | IServiceAccount | IServiceTokenData;
  };
  botId: Types.ObjectId;
  acceptedRoles: Array<"admin" | "member">;
}) => {
  const bot = await Bot.findById(botId);

  if (!bot) throw BotNotFoundError();

  if (
    authData.authMode === AUTH_MODE_JWT &&
    authData.authPayload instanceof User
  ) {
    await validateUserClientForWorkspace({
      user: authData.authPayload,
      workspaceId: bot.workspace,
      acceptedRoles,
    });

    return bot;
  }

  if (
    authData.authMode === AUTH_MODE_SERVICE_ACCOUNT &&
    authData.authPayload instanceof ServiceAccount
  ) {
    await validateServiceAccountClientForWorkspace({
      serviceAccount: authData.authPayload,
      workspaceId: bot.workspace,
    });

    return bot;
  }

  if (
    authData.authMode === AUTH_MODE_SERVICE_TOKEN &&
    authData.authPayload instanceof ServiceTokenData
  ) {
    throw UnauthorizedRequestError({
      message: "Failed service token authorization for bot",
    });
  }

  if (
    authData.authMode === AUTH_MODE_API_KEY &&
    authData.authPayload instanceof User
  ) {
    await validateUserClientForWorkspace({
      user: authData.authPayload,
      workspaceId: bot.workspace,
      acceptedRoles,
    });

    return bot;
  }

  throw BotNotFoundError({
    message: "Failed client authorization for bot",
  });
};

/**
 * Create an inactive bot with name [name] for workspace with id [workspaceId]
 * @param {Object} obj
 * @param {String} obj.name - name of bot
 * @param {String} obj.workspaceId - id of workspace that bot belongs to
 */
const createBot = async ({
  name,
  workspaceId,
}: {
  name: string;
  workspaceId: Types.ObjectId;
}) => {
  const { publicKey, privateKey } = generateKeyPair();
  const { ciphertext, iv, tag } = encryptSymmetric({
    plaintext: privateKey,
    key: await getEncryptionKey(),
  });

  const bot = await new Bot({
    name,
    workspace: workspaceId,
    isActive: false,
    publicKey,
    encryptedPrivateKey: ciphertext,
    iv,
    tag,
  }).save();

  return bot;
};

/**
 * Return decrypted secrets for workspace with id [workspaceId]
 * and [environment] using bot
 * @param {Object} obj
 * @param {String} obj.workspaceId - id of workspace
 * @param {String} obj.environment - environment
 */
const getSecretsHelper = async ({
  workspaceId,
  environment,
}: {
  workspaceId: Types.ObjectId;
  environment: string;
}) => {
  const content = {} as any;
  const key = await getKey({ workspaceId: workspaceId.toString() });
  const secrets = await Secret.find({
    workspace: workspaceId,
    environment,
    type: SECRET_SHARED,
  });

  secrets.forEach((secret: ISecret) => {
    const secretKey = decryptSymmetric({
      ciphertext: secret.secretKeyCiphertext,
      iv: secret.secretKeyIV,
      tag: secret.secretKeyTag,
      key,
    });

    const secretValue = decryptSymmetric({
      ciphertext: secret.secretValueCiphertext,
      iv: secret.secretValueIV,
      tag: secret.secretValueTag,
      key,
    });

    content[secretKey] = secretValue;
  });

  return content;
};

/**
 * Return bot's copy of the workspace key for workspace
 * with id [workspaceId]
 * @param {Object} obj
 * @param {String} obj.workspaceId - id of workspace
 * @returns {String} key - decrypted workspace key
 */
const getKey = async ({ workspaceId }: { workspaceId: string }) => {
  const botKey = await BotKey.findOne({
    workspace: workspaceId,
  }).populate<{ sender: IUser }>("sender", "publicKey");

  if (!botKey) throw new Error("Failed to find bot key");

  const bot = await Bot.findOne({
    workspace: workspaceId,
  }).select("+encryptedPrivateKey +iv +tag");

  if (!bot) throw new Error("Failed to find bot");
  if (!bot.isActive) throw new Error("Bot is not active");

  const privateKeyBot = decryptSymmetric({
    ciphertext: bot.encryptedPrivateKey,
    iv: bot.iv,
    tag: bot.tag,
    key: await getEncryptionKey(),
  });

  const key = decryptAsymmetric({
    ciphertext: botKey.encryptedKey,
    nonce: botKey.nonce,
    publicKey: botKey.sender.publicKey as string,
    privateKey: privateKeyBot,
  });

  return key;
};

/**
 * Return symmetrically encrypted [plaintext] using the
 * key for workspace with id [workspaceId]
 * @param {Object} obj1
 * @param {String} obj1.workspaceId - id of workspace
 * @param {String} obj1.plaintext - plaintext to encrypt
 */
const encryptSymmetricHelper = async ({
  workspaceId,
  plaintext,
}: {
  workspaceId: Types.ObjectId;
  plaintext: string;
}) => {
  const key = await getKey({ workspaceId: workspaceId.toString() });
  const { ciphertext, iv, tag } = encryptSymmetric({
    plaintext,
    key,
  });

  return {
    ciphertext,
    iv,
    tag,
  };
};
/**
 * Return symmetrically decrypted [ciphertext] using the
 * key for workspace with id [workspaceId]
 * @param {Object} obj
 * @param {String} obj.workspaceId - id of workspace
 * @param {String} obj.ciphertext - ciphertext to decrypt
 * @param {String} obj.iv - iv
 * @param {String} obj.tag - tag
 */
const decryptSymmetricHelper = async ({
  workspaceId,
  ciphertext,
  iv,
  tag,
}: {
  workspaceId: Types.ObjectId;
  ciphertext: string;
  iv: string;
  tag: string;
}) => {
  const key = await getKey({ workspaceId: workspaceId.toString() });
  const plaintext = decryptSymmetric({
    ciphertext,
    iv,
    tag,
    key,
  });

  return plaintext;
};

export {
  validateClientForBot,
  createBot,
  getSecretsHelper,
  encryptSymmetricHelper,
  decryptSymmetricHelper,
};
