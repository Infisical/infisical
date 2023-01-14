import { Types } from 'mongoose';
import * as Sentry from '@sentry/node';
import {
	Secret,
	ISecret
} from '../../models';
import {
	SecretSnapshot,
	SecretVersion,
	ISecretVersion
} from '../models';

/**
 * Save a secret snapshot that is a copy of the current state of secrets in workspace with id
 * [workspaceId] under a new snapshot with incremented version under the
 * secretsnapshots collection.
 * @param {Object} obj
 * @param {String} obj.workspaceId
 * @returns {SecretSnapshot} secretSnapshot - new secret snapshot
 */
const takeSecretSnapshotHelper = async ({
	workspaceId
}: {
	workspaceId: string;
}) => {

	let secretSnapshot;
	try {
		const secretIds = (await Secret.find({
			workspace: workspaceId
		}, '_id')).map((s) => s._id);

		const latestSecretVersions = (await SecretVersion.aggregate([
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
			.map((s) => s.versionId);

		const latestSecretSnapshot = await SecretSnapshot.findOne({
			workspace: workspaceId
		}).sort({ version: -1 });

		secretSnapshot = await new SecretSnapshot({
			workspace: workspaceId,
			version: latestSecretSnapshot ? latestSecretSnapshot.version + 1 : 1,
			secretVersions: latestSecretVersions
		}).save();
	} catch (err) {
		Sentry.setUser(null);
		Sentry.captureException(err);
		throw new Error('Failed to take a secret snapshot');
	}

	return secretSnapshot;
}

/**
 * Add secret versions [secretVersions] to the SecretVersion collection.
 * @param {Object} obj
 * @param {Object[]} obj.secretVersions
 * @returns {SecretVersion[]} newSecretVersions - new secret versions
 */
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
		throw new Error(`Failed to add secret versions [err=${err}]`);
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

/**
 * Initialize secret versioning by setting previously unversioned
 * secrets to version 1 and begin populating secret versions.
 */
const initSecretVersioningHelper = async () => {
	try {

		await Secret.updateMany(
			{ version: { $exists: false } },
			{ $set: { version: 1 } }
		);

		const unversionedSecrets: ISecret[] = await Secret.aggregate([
			{
				$lookup: {
					from: 'secretversions',
					localField: '_id',
					foreignField: 'secret',
					as: 'versions',
				},
			},
			{
				$match: {
					versions: { $size: 0 },
				},
			},
		]);

		if (unversionedSecrets.length > 0) {
			await addSecretVersionsHelper({
				secretVersions: unversionedSecrets.map((s, idx) => ({
					...s,
					secret: s._id,
					version: s.version ? s.version : 1,
					isDeleted: false,
					workspace: s.workspace,
					environment: s.environment
				}))
			});
		}

	} catch (err) {
		Sentry.setUser(null);
		Sentry.captureException(err);
		throw new Error('Failed to ensure that secrets are versioned');
	}
}

export {
	takeSecretSnapshotHelper,
	addSecretVersionsHelper,
	markDeletedSecretVersionsHelper,
	initSecretVersioningHelper
}