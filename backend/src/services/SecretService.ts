// WIP
import { Types } from 'mongoose';
import { 
    createSecretBlindIndexHelper,
    getSecretBlindIndexHelper
} from '../helpers/secrets';

class SecretService {
    /**
     * Create and return blind index for secret with
     * name [name] part of workspace with id [workspaceId]
     * @param {Object} obj
     * @param {Object} obj.secretName - name of secret to generate blind index for
     * @param {Object} obj.workspaceId - id of workspace that secret belongs to
     */
    static async createSecretBlindIndex({
        secretName,
        workspaceId,
    }: {
        secretName: string;
        workspaceId: Types.ObjectId;
    }) {
        return await createSecretBlindIndexHelper({
            secretName,
            workspaceId
        });
    }

    /**
     * Return the blind index for the secret with
     * name [name] part of workspace with id [workspaceId]
     * @param {Object} obj
     * @param {Object} obj.secretName - name of secret to generate blind index for
     * @param {Object} obj.workspaceId - id of workspace that secret belongs to
     */
    static async getSecretBlindIndex({
        secretName,
        workspaceId
    }: {
        secretName: string;
        workspaceId: Types.ObjectId;
    }) {
        return await getSecretBlindIndexHelper({
            secretName,
            workspaceId
        });
    }
}

export default SecretService;