// WIP
import { Types } from 'mongoose';
import {
    ISecret
} from '../models';
import {
    CreateSecretParams,
    GetSecretsParams,
    GetSecretParams,
    UpdateSecretParams,
    DeleteSecretParams
} from '../interfaces/services/SecretService';
import { 
    generateSecretBlindIndexHelper,
    createSecretHelper,
    getSecretsHelper,
    getSecretHelper,
    updateSecretHelper,
    deleteSecretHelper
} from '../helpers/secrets';

class SecretService {
    /**
     * Create and return blind index for secret with
     * name [secretName] part of workspace with id [workspaceId]
     * @param {Object} obj
     * @param {Object} obj.secretName - name of secret to generate blind index for
     * @param {Object} obj.workspaceId - id of workspace that secret belongs to
     */
    static async generateSecretBlindIndex({
        secretName,
        workspaceId,
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
    static async createSecret({
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
        secretValueTag
    }: CreateSecretParams) {
        return await createSecretHelper({
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
            secretValueTag
        });
    }

    /**
     * Get secrets for workspace with id [workspaceId] and environment [environment]
     * @param {Object} obj
     * @param {Types.ObjectId} obj.workspaceId - id of workspace
     * @param {String} obj.environment - environment in workspace
     * @param {AuthData} obj.authData - authentication data on request
     * @returns 
     */
    static async getSecrets({
        workspaceId,
        environment,
        authData 
    }: GetSecretsParams) {
        return await getSecretsHelper({
            workspaceId,
            environment,
            authData
        });
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
    static async getSecret({
        secretName,
        workspaceId,
        environment,
        type,
        authData
    }: GetSecretParams) {
        return await getSecretHelper({
            secretName,
            workspaceId,
            environment,
            type,
            authData
        });
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
    static async updateSecret({
        secretName,
        workspaceId,
        environment,
        type,
        secretValueCiphertext,
        secretValueIV,
        secretValueTag,
        authData
    }: UpdateSecretParams) {
        return await updateSecretHelper({
            secretName,
            workspaceId,
            environment,
            type,
            authData,
            secretValueCiphertext,
            secretValueIV,
            secretValueTag
        });
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
    static async deleteSecret({
        secretName,
        workspaceId,
        environment,
        type,
        authData
    }: DeleteSecretParams) {
        return await deleteSecretHelper({
            secretName,
            workspaceId,
            environment,
            type,
            authData
        });
    }
}

export default SecretService;