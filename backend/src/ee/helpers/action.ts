import * as Sentry from '@sentry/node';
import { Types } from 'mongoose';
import { Secret } from '../../models';
import { SecretVersion, Action } from '../models';
import { ACTION_UPDATE_SECRETS } from '../../variables';

/**
 * Create an (audit) action for secrets including
 * add, delete, update, and read actions.
 * @param {Object} obj
 * @param {String} obj.name - name of action
 * @param {ObjectId[]} obj.secretIds - ids of relevant secrets
 * @returns {Action} action - new action
 */
const createActionSecretHelper = async ({
    name,
    userId,
    workspaceId,
    secretIds
}: {
    name: string;
    userId: string;
    workspaceId: string;
    secretIds: Types.ObjectId[];
}) => {

    let action;
    let latestSecretVersions;
    try {
        if (name === ACTION_UPDATE_SECRETS) {
            // case: action is updating secrets
            // -> add old and new secret versions

            // TODO: make query more efficient
            latestSecretVersions = (await SecretVersion.aggregate([
                    {
                        $match: {
                        secret: {
                            $in: secretIds,
                        },
                        },
                    },
                    {
                        $sort: { version: -1 },
                    },
                    {
                        $group: {
                        _id: "$secret",
                        versions: { $push: "$$ROOT" },
                        },
                    },
                    {
                        $project: {
                        _id: 0,
                        secret: "$_id",
                        versions: { $slice: ["$versions", 2] },
                        },
                    }
                ]))
                .map((s) => ({
                    oldSecretVersion: s.versions[0]._id,
                    newSecretVersion: s.versions[1]._id
                }));


        } else {
            // case: action is adding, deleting, or reading secrets
            // -> add new secret versions
            latestSecretVersions = (await SecretVersion.aggregate([
				{
					$match: { 
                        secret: { 
                            $in: secretIds 
                        } 
                    }
				},
				{
					$group: {
						_id: '$secret',
						version: { $max: '$version' },
                        versionId: { $max: '$_id' } // secret version id
					}
				},
				{
					$sort: { version: -1 }
				}
				])
				.exec())
                .map((s) => ({
                    newSecretVersion: s.versionId
                }));
        }

        action = await new Action({
            name,
            user: userId,
            workspace: workspaceId,
            payload: {
                secretVersions: latestSecretVersions
            }
        }).save();

    } catch (err) {
		Sentry.setUser(null);
		Sentry.captureException(err);
        throw new Error('Failed to create action');
    }
    
    return action;
}

export { createActionSecretHelper };