import { Types } from "mongoose";
import {
  decryptSymmetricHelper,
  encryptSymmetricHelper,
  getIsWorkspaceE2EEHelper,
  getKey,
  getSecretsBotHelper,
  getSecretsCommentBotHelper,
} from "../helpers/bot";

/**
 * Class to handle bot actions
 */
class BotService {
  /**
   * Return whether or not workspace with id [workspaceId] is end-to-end encrypted
   * @param workspaceId - id of workspace
   * @returns {Boolean}
   */
  static async getIsWorkspaceE2EE(workspaceId: Types.ObjectId) {
    return await getIsWorkspaceE2EEHelper(workspaceId);
  }

  /**
   * Get workspace key for workspace with id [workspaceId] shared to bot.
   * @param {Object} obj
   * @param {Types.ObjectId} obj.workspaceId - id of workspace to get workspace key for
   * @returns
   */
  static async getWorkspaceKeyWithBot({
    workspaceId,
  }: {
    workspaceId: Types.ObjectId;
  }) {
    return await getKey({
      workspaceId,
    });
  }

  /**
   * Return decrypted secrets for workspace with id [workspaceId] and
   * environment [environmen] shared to bot.
   * @param {Object} obj
   * @param {String} obj.workspaceId - id of workspace of secrets
   * @param {String} obj.environment - environment for secrets
   * @returns {Object} secretObj - object where keys are secret keys and values are secret values
   */
  static async getSecrets({
    workspaceId,
    environment,
    secretPath,
  }: {
    workspaceId: Types.ObjectId;
    environment: string;
    secretPath: string;
  }) {
    return await getSecretsBotHelper({
      workspaceId,
      environment,
      secretPath,
    });
  }

  /**
   * Return symmetrically encrypted [plaintext] using the
   * bot's copy of the workspace key for workspace with id [workspaceId]
   * @param {Object} obj
   * @param {String} obj.workspaceId - id of workspace
   * @param {String} obj.plaintext - plaintext to encrypt
   */
  static async encryptSymmetric({
    workspaceId,
    plaintext,
  }: {
    workspaceId: Types.ObjectId;
    plaintext: string;
  }) {
    return await encryptSymmetricHelper({
      workspaceId,
      plaintext,
    });
  }

  /**
   * Return symmetrically decrypted [ciphertext] using the
   * bot's copy of the workspace key for workspace with id [workspaceId]
   * @param {Object} obj
   * @param {String} obj.workspaceId - id of workspace
   * @param {String} obj.ciphertext - ciphertext to decrypt
   * @param {String} obj.iv - iv
   * @param {String} obj.tag - tag
   */
  static async decryptSymmetric({
    workspaceId,
    ciphertext,
    iv,
    tag,
  }: {
    workspaceId: Types.ObjectId;
    ciphertext: string;
    iv: string;
    tag: string;
  }) {
    return await decryptSymmetricHelper({
      workspaceId,
      ciphertext,
      iv,
      tag,
    });
  }

  /**
   * Return decrypted secret comments for workspace with id [worskpaceId] and
   * environment [environment] shared to bot.
   * @param {Object} obj
   * @param {String} obj.workspaceId - id of workspace of secrets
   * @param {String} obj.environment - environment for secrets
   * @returns {Object} secretObj - object where keys are secret keys and values are comments
   */
  static async getSecretComments({
    workspaceId,
    environment,
    secretPath
  }: {
    workspaceId: Types.ObjectId;
    environment: string;
    secretPath: string;
  }) {
    return await getSecretsCommentBotHelper({
      workspaceId,
      environment,
      secretPath
    });
  }
}

export default BotService;
