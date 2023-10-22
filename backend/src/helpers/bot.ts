import { Types } from "mongoose";
import { Bot, BotKey, ISecret, IUser, Secret } from "../models";
import {
  decryptAsymmetric,
  decryptSymmetric128BitHexKeyUTF8,
  encryptSymmetric128BitHexKeyUTF8,
  generateKeyPair
} from "../utils/crypto";
import {
  ALGORITHM_AES_256_GCM,
  ENCODING_SCHEME_BASE64,
  ENCODING_SCHEME_UTF8,
  SECRET_SHARED
} from "../variables";
import { client, getEncryptionKey, getRootEncryptionKey } from "../config";
import { InternalServerError } from "../utils/errors";
import { Folder } from "../models";
import { getFolderByPath } from "../services/FolderService";
import { getAllImportedSecrets } from "../services/SecretImportService";
import { expandSecrets } from "./secrets";

/**
 * Create an inactive bot with name [name] for workspace with id [workspaceId]
 * @param {Object} obj
 * @param {String} obj.name - name of bot
 * @param {String} obj.workspaceId - id of workspace that bot belongs to
 */
export const createBot = async ({
  name,
  workspaceId
}: {
  name: string;
  workspaceId: Types.ObjectId;
}) => {
  const encryptionKey = await getEncryptionKey();
  const rootEncryptionKey = await getRootEncryptionKey();

  const { publicKey, privateKey } = generateKeyPair();

  if (rootEncryptionKey) {
    const { ciphertext, iv, tag } = client.encryptSymmetric(privateKey, rootEncryptionKey);

    return await new Bot({
      name,
      workspace: workspaceId,
      isActive: false,
      publicKey,
      encryptedPrivateKey: ciphertext,
      iv,
      tag,
      algorithm: ALGORITHM_AES_256_GCM,
      keyEncoding: ENCODING_SCHEME_BASE64
    }).save();
  } else if (encryptionKey) {
    const { ciphertext, iv, tag } = encryptSymmetric128BitHexKeyUTF8({
      plaintext: privateKey,
      key: await getEncryptionKey()
    });

    return await new Bot({
      name,
      workspace: workspaceId,
      isActive: false,
      publicKey,
      encryptedPrivateKey: ciphertext,
      iv,
      tag,
      algorithm: ALGORITHM_AES_256_GCM,
      keyEncoding: ENCODING_SCHEME_UTF8
    }).save();
  }

  throw InternalServerError({
    message: "Failed to create new bot due to missing encryption key"
  });
};

/**
 * Return whether or not workspace with id [workspaceId] is end-to-end encrypted
 * @param {Types.ObjectId} workspaceId - id of workspace to check
 */
export const getIsWorkspaceE2EEHelper = async (workspaceId: Types.ObjectId) => {
  const botKey = await BotKey.exists({
    workspace: workspaceId
  });

  return botKey ? false : true;
};

/**
 * Return decrypted secrets for workspace with id [workspaceId]
 * and [environment] using bot
 * @param {Object} obj
 * @param {String} obj.workspaceId - id of workspace
 * @param {String} obj.environment - environment
 */
export const getSecretsBotHelper = async ({
  workspaceId,
  environment,
  secretPath
}: {
  workspaceId: Types.ObjectId;
  environment: string;
  secretPath: string;
}) => {
  const content: Record<
    string,
    { value: string; comment?: string; skipMultilineEncoding?: boolean }
  > = {};
  const key = await getKey({ workspaceId: workspaceId });

  let folderId = "root";
  const folders = await Folder.findOne({
    workspace: workspaceId,
    environment
  });

  if (!folders && secretPath !== "/") {
    throw InternalServerError({ message: "Folder not found" });
  }

  if (folders) {
    const folder = getFolderByPath(folders.nodes, secretPath);
    if (!folder) {
      throw InternalServerError({ message: "Folder not found" });
    }
    folderId = folder.id;
  }

  const secrets = await Secret.find({
    workspace: workspaceId,
    environment,
    type: SECRET_SHARED,
    folder: folderId
  });

  const importedSecrets = await getAllImportedSecrets(
    workspaceId.toString(),
    environment,
    folderId,
    () => true // integrations are setup to read all the ones
  );

  importedSecrets.forEach(({ secrets }) => {
    secrets.forEach((secret) => {
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

      content[secretKey] = { value: secretValue };

      if (secret.secretCommentCiphertext && secret.secretCommentIV && secret.secretCommentTag) {
        const commentValue = decryptSymmetric128BitHexKeyUTF8({
          ciphertext: secret.secretCommentCiphertext,
          iv: secret.secretCommentIV,
          tag: secret.secretCommentTag,
          key
        });
        content[secretKey].comment = commentValue;
      }

      content[secretKey].skipMultilineEncoding = secret.skipMultilineEncoding;
    });
  });

  secrets.forEach((secret: ISecret) => {
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

    content[secretKey] = { value: secretValue };

    if (secret.secretCommentCiphertext && secret.secretCommentIV && secret.secretCommentTag) {
      const commentValue = decryptSymmetric128BitHexKeyUTF8({
        ciphertext: secret.secretCommentCiphertext,
        iv: secret.secretCommentIV,
        tag: secret.secretCommentTag,
        key
      });
      content[secretKey].comment = commentValue;
    }

    content[secretKey].skipMultilineEncoding = secret.skipMultilineEncoding;
  });

  await expandSecrets(workspaceId.toString(), key, content);

  return content;
};

/**
 * Return bot's copy of the workspace key for workspace
 * with id [workspaceId]
 * @param {Object} obj
 * @param {String} obj.workspaceId - id of workspace
 * @returns {String} key - decrypted workspace key
 */
export const getKey = async ({ workspaceId }: { workspaceId: Types.ObjectId }) => {
  const encryptionKey = await getEncryptionKey();
  const rootEncryptionKey = await getRootEncryptionKey();

  const botKey = await BotKey.findOne({
    workspace: workspaceId
  }).populate<{ sender: IUser }>("sender", "publicKey");

  if (!botKey) throw new Error("Failed to find bot key");

  const bot = await Bot.findOne({
    workspace: workspaceId
  }).select("+encryptedPrivateKey +iv +tag +algorithm +keyEncoding");

  if (!bot) throw new Error("Failed to find bot");
  if (!bot.isActive) throw new Error("Bot is not active");

  if (rootEncryptionKey && bot.keyEncoding === ENCODING_SCHEME_BASE64) {
    // case: encoding scheme is base64
    const privateKeyBot = client.decryptSymmetric(
      bot.encryptedPrivateKey,
      rootEncryptionKey,
      bot.iv,
      bot.tag
    );

    return decryptAsymmetric({
      ciphertext: botKey.encryptedKey,
      nonce: botKey.nonce,
      publicKey: botKey.sender.publicKey as string,
      privateKey: privateKeyBot
    });
  } else if (encryptionKey && bot.keyEncoding === ENCODING_SCHEME_UTF8) {
    // case: encoding scheme is utf8
    const privateKeyBot = decryptSymmetric128BitHexKeyUTF8({
      ciphertext: bot.encryptedPrivateKey,
      iv: bot.iv,
      tag: bot.tag,
      key: encryptionKey
    });

    return decryptAsymmetric({
      ciphertext: botKey.encryptedKey,
      nonce: botKey.nonce,
      publicKey: botKey.sender.publicKey as string,
      privateKey: privateKeyBot
    });
  }

  throw InternalServerError({
    message: "Failed to obtain bot's copy of workspace key needed for bot operations"
  });
};

/**
 * Return symmetrically encrypted [plaintext] using the
 * key for workspace with id [workspaceId]
 * @param {Object} obj1
 * @param {String} obj1.workspaceId - id of workspace
 * @param {String} obj1.plaintext - plaintext to encrypt
 */
export const encryptSymmetricHelper = async ({
  workspaceId,
  plaintext
}: {
  workspaceId: Types.ObjectId;
  plaintext: string;
}) => {
  const key = await getKey({ workspaceId: workspaceId });
  const { ciphertext, iv, tag } = encryptSymmetric128BitHexKeyUTF8({
    plaintext,
    key
  });

  return {
    ciphertext,
    iv,
    tag
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
export const decryptSymmetricHelper = async ({
  workspaceId,
  ciphertext,
  iv,
  tag
}: {
  workspaceId: Types.ObjectId;
  ciphertext: string;
  iv: string;
  tag: string;
}) => {
  const key = await getKey({ workspaceId: workspaceId });
  const plaintext = decryptSymmetric128BitHexKeyUTF8({
    ciphertext,
    iv,
    tag,
    key
  });

  return plaintext;
};

/**
 * Return decrypted comments for workspace secrets with id [workspaceId]
 * and [envionment] using bot
 * @param {Object} obj
 * @param {String} obj.workspaceId - id of workspace
 * @param {String} obj.environment - environment
 */
export const getSecretsCommentBotHelper = async ({
  workspaceId,
  environment,
  secretPath
}: {
  workspaceId: Types.ObjectId;
  environment: string;
  secretPath: string;
}) => {
  const content = {} as any;
  const key = await getKey({ workspaceId: workspaceId });

  let folderId = "root";
  const folders = await Folder.findOne({
    workspace: workspaceId,
    environment
  });

  if (!folders && secretPath !== "/") {
    throw InternalServerError({ message: "Folder not found" });
  }

  if (folders) {
    const folder = getFolderByPath(folders.nodes, secretPath);
    if (!folder) {
      throw InternalServerError({ message: "Folder not found" });
    }
    folderId = folder.id;
  }

  const secrets = await Secret.find({
    workspace: workspaceId,
    environment,
    type: SECRET_SHARED,
    folder: folderId
  });

  secrets.forEach((secret: ISecret) => {
    if (secret.secretCommentCiphertext && secret.secretCommentIV && secret.secretCommentTag) {
      const secretKey = decryptSymmetric128BitHexKeyUTF8({
        ciphertext: secret.secretKeyCiphertext,
        iv: secret.secretKeyIV,
        tag: secret.secretKeyTag,
        key
      });

      const commentValue = decryptSymmetric128BitHexKeyUTF8({
        ciphertext: secret.secretCommentCiphertext,
        iv: secret.secretCommentIV,
        tag: secret.secretCommentTag,
        key
      });

      content[secretKey] = commentValue;
    }
  });

  return content;
};
