import * as Sentry from '@sentry/node';
import { Types } from 'mongoose';
import { Action } from '../models';
import { 
    getLatestSecretVersionIds,
    getLatestNSecretSecretVersionIds
} from '../helpers/secretVersion';
import { 
    ACTION_LOGIN,
    ACTION_LOGOUT,
    ACTION_ADD_SECRETS,
    ACTION_READ_SECRETS,
    ACTION_DELETE_SECRETS,
    ACTION_UPDATE_SECRETS,
} from '../../variables';

/**
 * Create an (audit) action for updating secrets
 * @param {Object} obj
 * @param {String} obj.name - name of action
 * @param {Types.ObjectId} obj.secretIds - ids of relevant secrets
 * @returns {Action} action - new action
 */
const createActionUpdateSecret = async ({
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
    workspaceId: Types.ObjectId;
    secretIds: Types.ObjectId[];
}) => {
    let action;
    try {
        const latestSecretVersions = (await getLatestNSecretSecretVersionIds({
                secretIds,
                n: 2
            }))
            .map((s) => ({
                oldSecretVersion: s.versions[0]._id,
                newSecretVersion: s.versions[1]._id
            }));
        
        action = await new Action({
            name,
            user: userId,
            serviceAccount: serviceAccountId,
            serviceTokenData: serviceTokenDataId,
            workspace: workspaceId,
            payload: {
                secretVersions: latestSecretVersions
            }
        }).save();

    } catch (err) {
		Sentry.setUser(null);
		Sentry.captureException(err);
        throw new Error('Failed to create update secret action');
    }
    
    return action;
}

/**
 * Create an (audit) action for creating, reading, and deleting
 * secrets
 * @param {Object} obj
 * @param {String} obj.name - name of action
 * @param {Types.ObjectId} obj.secretIds - ids of relevant secrets
 * @returns {Action} action - new action
 */
const createActionSecret = async ({
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
    workspaceId: Types.ObjectId;
    secretIds: Types.ObjectId[];
}) => {
    let action;
    try {
        // case: action is adding, deleting, or reading secrets
        // -> add new secret versions
        const latestSecretVersions = (await getLatestSecretVersionIds({
            secretIds
        }))
        .map((s) => ({
            newSecretVersion: s.versionId
        }));
        
       action = await new Action({
            name,
            user: userId,
            serviceAccount: serviceAccountId,
            serviceTokenData: serviceTokenDataId,
            workspace: workspaceId,
            payload: {
                secretVersions: latestSecretVersions
            }
        }).save(); 

    } catch (err) {
		Sentry.setUser(null);
		Sentry.captureException(err);
        throw new Error('Failed to create action create/read/delete secret action');
    }
    
    return action;
}

/**
 * Create an (audit) action for client with id [userId],
 * [serviceAccountId], or [serviceTokenDataId]
 * @param {Object} obj 
 * @param {String} obj.name - name of action
 * @param {String} obj.userId - id of user associated with action
 * @returns 
 */
const createActionClient = ({
    name,
    userId,
    serviceAccountId,
    serviceTokenDataId
}: {
    name: string;
    userId?: Types.ObjectId;
    serviceAccountId?: Types.ObjectId;
    serviceTokenDataId?: Types.ObjectId;
}) => {
    let action;
    try {
        action = new Action({
            name,
            user: userId,
            serviceAccount: serviceAccountId,
            serviceTokenData: serviceTokenDataId
        }).save();
    } catch (err) {
        Sentry.setUser(null);
        Sentry.captureException(err);
        throw new Error('Failed to create client action');
    }

    return action; 
}

/**
 * Create an (audit) action. 
 * @param {Object} obj
 * @param {Object} obj.name - name of action
 * @param {Types.ObjectId} obj.userId - id of user associated with action
 * @param {Types.ObjectId} obj.workspaceId - id of workspace associated with action
 * @param {Types.ObjectId[]} obj.secretIds - ids of secrets associated with action
*/
const createActionHelper = async ({
    name,
    userId,
    serviceAccountId,
    serviceTokenDataId,
    workspaceId,
    secretIds,
}: {
    name: string;
    userId?: Types.ObjectId;
    serviceAccountId?: Types.ObjectId;
    serviceTokenDataId?: Types.ObjectId;
    workspaceId?: Types.ObjectId;
    secretIds?: Types.ObjectId[];
}) => {
    let action;
    try {
        switch (name) {
            case ACTION_LOGIN:
            case ACTION_LOGOUT:
                action = await createActionClient({
                    name,
                    userId
                });
                break;
            case ACTION_ADD_SECRETS:
            case ACTION_READ_SECRETS:
            case ACTION_DELETE_SECRETS:
                if (!workspaceId || !secretIds) throw new Error('Missing required params workspace id or secret ids to create action secret');
                action = await createActionSecret({
                    name,
                    userId,
                    workspaceId,
                    secretIds
                });
                break;
            case ACTION_UPDATE_SECRETS:
                if (!workspaceId || !secretIds) throw new Error('Missing required params workspace id or secret ids to create action secret');
                action = await createActionUpdateSecret({
                    name,
                    userId,
                    workspaceId,
                    secretIds
                });
                break;
        }
    } catch (err) {
        Sentry.setUser(null);
		Sentry.captureException(err);
        throw new Error('Failed to create action');
    }
    
    return action;
}

export { 
    createActionHelper
};