import { Types } from 'mongoose';
import { 
    Log,
    Action,
    IAction
} from '../models';
import {
    createLogHelper
} from '../helpers/log';
import {
    createActionSecretHelper
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
        workspaceId,
        actions,
        channel,
        ipAddress
    }: {
        userId: string;
        workspaceId: string;
        actions: IAction[];
        channel: string;
        ipAddress: string;
    }) {
        if (!EELicenseService.isLicenseValid) return null;
        return await createLogHelper({
            userId,
            workspaceId,
            actions,
            channel,
            ipAddress
        })
    }
    
    /**
     * Create an (audit) action for secrets including
     * add, delete, update, and read actions.
     * @param {Object} obj
     * @param {String} obj.name - name of action
     * @param {ObjectId[]} obj.secretIds - secret ids
     * @returns {Action} action - new action
     */
    static async createActionSecret({
        name,
        userId,
        workspaceId,
        secretIds
    }: {
        name: string;
        userId: string;
        workspaceId: string;
        secretIds: Types.ObjectId[];
    }) {
        if (!EELicenseService.isLicenseValid) return null; 
        return await createActionSecretHelper({
            name,
            userId,
            workspaceId,
            secretIds
        });
    }
}

export default EELogService;