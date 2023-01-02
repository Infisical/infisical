import { Types } from 'mongoose';
import * as Sentry from '@sentry/node';
import {
    Secret
} from '../../models';
import {
    SecretSnapshot,
	SecretVersion,
	ISecretVersion
} from '../models';

/**
 * Save a copy of the current state of secrets in workspace with id
 * [workspaceId] under a new snapshot with incremented version under the
 * secretsnapshots collection.
 * @param {Object} obj
 * @param {String} obj.workspaceId
 */
 const takeSecretSnapshotHelper = async ({
	workspaceId
}: {
	workspaceId: string;
}) => {
	try {
		const secrets = await Secret.find({
			workspace: workspaceId
		});
		
		const latestSecretSnapshot = await SecretSnapshot.findOne({
			workspace: workspaceId
		}).sort({ version: -1 });
		
		if (!latestSecretSnapshot) {
			// case: no snapshots exist for workspace -> create first snapshot
			await new SecretSnapshot({
				workspace: workspaceId,
				version: 1,
				secrets 
			}).save();	

			return;
		}
		
		// case: snapshots exist for workspace
		await new SecretSnapshot({
			workspace: workspaceId,
			version: latestSecretSnapshot.version + 1,
			secrets 
		}).save();
		
	} catch (err) {
		Sentry.setUser(null);
		Sentry.captureException(err);
		throw new Error('Failed to take a secret snapshot');
	}
}

const addSecretVersionsHelper = async ({
	secretVersions
}: {
	secretVersions: ISecretVersion[]
}) => {
	let newSecretVersions;
	try {
		newSecretVersions = await SecretVersion.insertMany(secretVersions);
	} catch (err) {
		Sentry.setUser(null);
		Sentry.captureException(err);
		throw new Error('Failed to add secret versions');
	}
	
	return newSecretVersions;
}

const markDeletedSecretVersionsHelper = async ({
	secretIds
}: {
	secretIds: Types.ObjectId[];
}) => {
	try {
		await SecretVersion.updateMany({
			secret: { $in: secretIds }
		}, {
			isDeleted: true
		}, {
			new: true
		});
	} catch (err) {
		Sentry.setUser(null);
		Sentry.captureException(err);
		throw new Error('Failed to mark secret versions as deleted');
	}
}

export {
    takeSecretSnapshotHelper,
	addSecretVersionsHelper,
	markDeletedSecretVersionsHelper
}