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
  createSecretBatchHelper,
  createSecretBlindIndexDataHelper,
  createSecretHelper,
  deleteSecretBatchHelper,
  deleteSecretHelper,
  generateSecretBlindIndexHelper,
  generateSecretBlindIndexWithSaltHelper,
  getSecretBlindIndexSaltHelper,
  getSecretHelper,
  getSecretsHelper,
  updateSecretBatchHelper,
  updateSecretHelper
} from "../helpers/secrets";

class SecretService {
  /**
   * Create secret blind index data containing encrypted blind index salt
   * for workspace with id [workspaceId]
   * @param {Object} obj
   * @param {Buffer} obj.salt - 16-byte random salt
   * @param {Types.ObjectId} obj.workspaceId
   */
  static async createSecretBlindIndexData({ workspaceId }: { workspaceId: Types.ObjectId }) {
    return await createSecretBlindIndexDataHelper({
      workspaceId
    });
  }

  /**
   * Get secret blind index salt for workspace with id [workspaceId]
   * @param {Object} obj
   * @param {Types.ObjectId} obj.workspaceId - id of workspace to get salt for
   * @returns
   */
  static async getSecretBlindIndexSalt({ workspaceId }: { workspaceId: Types.ObjectId }) {
    return await getSecretBlindIndexSaltHelper({
      workspaceId
    });
  }

  /**
   * Generate blind index for secret with name [secretName]
   * and salt [salt]
   * @param {Object} obj
   * @param {Object} obj.secretName - name of secret to generate blind index for
   * @param {String} obj.salt - base64-salt
   */
  static async generateSecretBlindIndexWithSalt({
    secretName,
    salt
  }: {
    secretName: string;
    salt: string;
  }) {
    return await generateSecretBlindIndexWithSaltHelper({
      secretName,
      salt
    });
  }

  /**
   * Create and return blind index for secret with
   * name [secretName] part of workspace with id [workspaceId]
   * @param {Object} obj
   * @param {String} obj.secretName - name of secret to generate blind index for
   * @param {Types.ObjectId} obj.workspaceId - id of workspace that secret belongs to
   */
  static async generateSecretBlindIndex({
    secretName,
    workspaceId
  }: {
    secretName: string;
    workspaceId: Types.ObjectId;
  }) {
    return await generateSecretBlindIndexHelper({
      secretName,
      workspaceId
    });
  }

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
  static async createSecret(createSecretParams: CreateSecretParams) {
    return await createSecretHelper(createSecretParams);
  }

  /**
   * Get secrets for workspace with id [workspaceId] and environment [environment]
   * @param {Object} obj
   * @param {Types.ObjectId} obj.workspaceId - id of workspace
   * @param {String} obj.environment - environment in workspace
   * @param {AuthData} obj.authData - authentication data on request
   * @returns
   */
  static async getSecrets(getSecretsParams: GetSecretsParams) {
    return await getSecretsHelper(getSecretsParams);
  }

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
  static async getSecret(getSecretParams: GetSecretParams) {
    // TODO(akhilmhdh) The one above is diff. Change this to some other name
    return await getSecretHelper(getSecretParams);
  }

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
  static async updateSecret(updateSecretParams: UpdateSecretParams) {
    return await updateSecretHelper(updateSecretParams);
  }

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
  static async deleteSecret(deleteSecretParams: DeleteSecretParams) {
    return await deleteSecretHelper(deleteSecretParams);
  }

  static async createSecretBatch(createSecretParams: CreateSecretBatchParams) {
    return await createSecretBatchHelper(createSecretParams);
  }

  static async updateSecretBatch(updateSecretParams: UpdateSecretBatchParams) {
    return await updateSecretBatchHelper(updateSecretParams);
  }

  static async deleteSecretBatch(deleteSecretParams: DeleteSecretBatchParams) {
    return await deleteSecretBatchHelper(deleteSecretParams);
  }
}

export default SecretService;
