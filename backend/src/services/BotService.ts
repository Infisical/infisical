import { Types } from 'mongoose';
import {
    getSecretsHelper,
    encryptSymmetricHelper,
    decryptSymmetricHelper
} from '../helpers/bot';

/**
 * Class to handle bot actions
 */
class BotService {
    
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
        environment
    }: {
        workspaceId: Types.ObjectId;
        environment: string;
    }) {
        return await getSecretsHelper({
            workspaceId,
            environment
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
        plaintext
    }: {
        workspaceId: Types.ObjectId;
        plaintext: string;
    }) {
        return await encryptSymmetricHelper({
            workspaceId,
            plaintext
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
        tag
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
            tag
        });
    }
}

export default BotService;