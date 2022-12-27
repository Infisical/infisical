import { 
    Action,
    IAction
} from '../models';
import {
    createLogHelper
} from '../helpers/log';
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
        if (!EELicenseService.isLicenseValid) return;
        return await createLogHelper({
            userId,
            workspaceId,
            actions,
            channel,
            ipAddress
        })
    }
}

export default EELogService;