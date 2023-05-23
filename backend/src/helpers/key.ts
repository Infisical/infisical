import * as Sentry from '@sentry/node';
import { Key, IKey } from '../models';

interface Key {
	encryptedKey: string;
	nonce: string;
	userId: string;
}

/**
 * Push (access) [keys] for workspace with id [workspaceId] with
 * user with id [userId] as the sender
 * @param {Object} obj
 * @param {String} obj.userId - id of sender user
 * @param {String} obj.workspaceId - id of workspace that keys belong to
 * @param {Object[]} obj.keys - (access) keys to push
 * @param {String} obj.keys.encryptedKey - encrypted key under receiver's public key
 * @param {String} obj.keys.nonce - nonce for encryption
 * @param {String} obj.keys.userId - id of receiver user
 */
const pushKeys = async ({
	userId,
	workspaceId,
	keys
}: {
	userId: string;
	workspaceId: string;
	keys: Key[];
}): Promise<void> => {
	try {
		// filter out already-inserted keys
		const keysSet = new Set(
			(
				await Key.find(
					{
						workspace: workspaceId
					},
					'receiver'
				)
			).map((k: IKey) => k.receiver.toString())
		);

		keys = keys.filter((key) => !keysSet.has(key.userId));

		// add new shared keys only
		await Key.insertMany(
			keys.map((k) => ({
				encryptedKey: k.encryptedKey,
				nonce: k.nonce,
				sender: userId,
				receiver: k.userId,
				workspace: workspaceId
			}))
		);
	} catch (err) {
		Sentry.setUser(null);
		Sentry.captureException(err);
		throw new Error('Failed to push access keys');
	}
};

export { pushKeys };
