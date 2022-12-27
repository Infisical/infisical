import * as Sentry from '@sentry/node';
import { 
    Log,
    IAction
} from '../models';

const createLogHelper = async ({
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
}) => {
    let log;
    try {
        log = await new Log({
            user: userId,
            workspace: workspaceId,
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