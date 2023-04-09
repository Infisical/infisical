import { Types } from 'mongoose';
import { 
    IAction
} from '../models';
import {
    createLogHelper
} from '../helpers/log';
import {
    createActionHelper
} from '../helpers/action';
import EELicenseService from './EELicenseService';

/**
 * Class to handle Enterprise Edition log actions
 */
class EELogService {
    /**
     * Create an (audit) log
     * @param {Object} obj
     * @param {String} obj.userId - id of user associated with the log
     * @param {String} obj.workspaceId - id of workspace associated with the log
     * @param {Action} obj.actions - actions to include in log
     * @param {String} obj.channel - channel (web/cli/auto) associated with the log
     * @param {String} obj.ipAddress - ip address associated with the log
     * @returns {Log} log - new audit log
     */
    static async createLog({
        userId,
        serviceAccountId,
        serviceTokenDataId,
        workspaceId,
        actions,
        channel,
        ipAddress
    }: {
        userId?: Types.ObjectId;
        serviceAccountId?: Types.ObjectId;
        serviceTokenDataId?: Types.ObjectId;
        workspaceId?: Types.ObjectId;
        actions: IAction[];
        channel: string;
        ipAddress: string;
    }) {
        if (!EELicenseService.isLicenseValid) return null;
        return await createLogHelper({
            userId,
            serviceAccountId,
            serviceTokenDataId,
            workspaceId,
            actions,
            channel,
            ipAddress
        })
    }
    
    /**
     * Create an (audit) action
     * @param {Object} obj
     * @param {String} obj.name - name of action
     * @param {Types.ObjectId} obj.userId - id of user associated with the action
     * @param {Types.ObjectId} obj.workspaceId - id of workspace associated with the action
     * @param {ObjectId[]} obj.secretIds - ids of secrets associated with the action
     * @returns {Action} action - new action
     */
    static async createAction({
        name,
        userId,
        serviceAccountId,
        serviceTokenDataId,
        workspaceId,
        secretIds
    }: {
        name: string;
        userId?: Types.ObjectId;
        serviceAccountId?: Types.ObjectId;
        serviceTokenDataId?: Types.ObjectId;
        workspaceId?: Types.ObjectId;
        secretIds?: Types.ObjectId[];
    }) {
        return await createActionHelper({
            name,
            userId,
            serviceAccountId,
            serviceTokenDataId,
            workspaceId,
            secretIds
        });
    }
}

export default EELogService;