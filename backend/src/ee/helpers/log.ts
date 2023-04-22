import * as Sentry from '@sentry/node';
import { Types } from 'mongoose';
import { 
    Log,
    IAction
} from '../models';

/**
 * Create an (audit) log
 * @param {Object} obj
 * @param {Types.ObjectId} obj.userId - id of user associated with the log
 * @param {Types.ObjectId} obj.workspaceId - id of workspace associated with the log
 * @param {IAction[]} obj.actions - actions to include in log
 * @param {String} obj.channel - channel (web/cli/auto) associated with the log
 * @param {String} obj.ipAddress - ip address associated with the log
 * @returns {Log} log - new audit log
 */
const createLogHelper = async ({
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
}) => {
    let log;
    try {
        log = await new Log({
            user: userId,
            serviceAccount: serviceAccountId,
            serviceTokenData: serviceTokenDataId,
            workspace: workspaceId ?? undefined,
            actionNames: actions.map((a) => a.name),
            actions,
            channel,
            ipAddress
        }).save();
    } catch (err) {
        Sentry.setUser(null);
		Sentry.captureException(err);
		throw new Error('Failed to create log');
    }

    return log;
}

export {
    createLogHelper
}