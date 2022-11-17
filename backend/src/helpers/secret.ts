import * as Sentry from '@sentry/node';
import {
	Secret,
	ISecret
} from '../models';
import { decryptSymmetric } from '../utils/crypto';
import { SECRET_SHARED, SECRET_PERSONAL } from '../variables';

interface PushSecret {
	ciphertextKey: string;
	ivKey: string;
	tagKey: string;
	hashKey: string;
	ciphertextValue: string;
	ivValue: string;
	tagValue: string;
	hashValue: string;
	type: 'shared' | 'personal';
}

interface Update {
	[index: string]: string;
}

type DecryptSecretType = 'text' | 'object' | 'expanded';

/**
 * Push secrets for user with id [userId] to workspace
 * with id [workspaceId] with environment [environment]. Follow steps:
 * 1. Handle shared secrets (insert, delete)
 * 2. handle personal secrets (insert, delete)
 * @param {Object} obj
 * @param {String} obj.userId - id of user to push secrets for
 * @param {String} obj.workspaceId - id of workspace to push to
 * @param {String} obj.environment - environment for secrets
 * @param {Object[]} obj.secrets - secrets to push
 */
const pushSecrets = async ({
	userId,
	workspaceId,
	environment,
	secrets
}: {
	userId: string;
	workspaceId: string;
	environment: string;
	secrets: PushSecret[];
}): Promise<void> => {
	try {
		// construct useful data structures
		const oldSecrets = await pullSecrets({
			userId,
			workspaceId,
			environment
		});
		const oldSecretsObj: any = oldSecrets.reduce((accumulator, s: any) => {
			return { ...accumulator, [s.secretKeyHash]: s };
		}, {});
		const newSecretsObj = secrets.reduce((accumulator, s) => {
			return { ...accumulator, [s.hashKey]: s };
		}, {});

		// handle deleting secrets
		const toDelete = oldSecrets.filter(
			(s: ISecret) => !(s.secretKeyHash in newSecretsObj)
		);
		if (toDelete.length > 0) {
			await Secret.deleteMany({
				_id: { $in: toDelete.map((s) => s._id) }
			});
		}

		// handle modifying secrets where type or value changed
		const operations = secrets
			.filter((s) => {
				if (s.hashKey in oldSecretsObj) {
					if (s.hashValue !== oldSecretsObj[s.hashKey].secretValueHash) {
						// case: filter secrets where value changed
						return true;
					}

					if (s.type !== oldSecretsObj[s.hashKey].type) {
						// case: filter secrets where type changed
						return true;
					}
				}

				return false;
			})
			.map((s) => {
				const update: Update = {
					type: s.type,
					secretValueCiphertext: s.ciphertextValue,
					secretValueIV: s.ivValue,
					secretValueTag: s.tagValue,
					secretValueHash: s.hashValue
				};

				if (s.type === SECRET_PERSONAL) {
					// attach user assocaited with the personal secret
					update['user'] = userId;
				}

				return {
					updateOne: {
						filter: {
							workspace: workspaceId,
							_id: oldSecretsObj[s.hashKey]._id
						},
						update
					}
				};
			});
		const a = await Secret.bulkWrite(operations as any);

		// handle adding new secrets
		const toAdd = secrets.filter((s) => !(s.hashKey in oldSecretsObj));

		if (toAdd.length > 0) {
			// add secrets
			await Secret.insertMany(
				toAdd.map((s, idx) => {
					let obj: any = {
						workspace: workspaceId,
						type: toAdd[idx].type,
						environment,
						secretKeyCiphertext: s.ciphertextKey,
						secretKeyIV: s.ivKey,
						secretKeyTag: s.tagKey,
						secretKeyHash: s.hashKey,
						secretValueCiphertext: s.ciphertextValue,
						secretValueIV: s.ivValue,
						secretValueTag: s.tagValue,
						secretValueHash: s.hashValue
					};

					if (toAdd[idx].type === 'personal') {
						obj['user' as keyof typeof obj] = userId;
					}

					return obj;
				})
			);
		}
	} catch (err) {
		Sentry.setUser(null);
		Sentry.captureException(err);
		throw new Error('Failed to push shared and personal secrets');
	}
};

/**
 * Pull secrets for user with id [userId] for workspace
 * with id [workspaceId] with environment [environment]
 * @param {Object} obj
 * @param {String} obj.userId -id of user to pull secrets for
 * @param {String} obj.workspaceId - id of workspace to pull from
 * @param {String} obj.environment - environment for secrets
 *
 */
const pullSecrets = async ({
	userId,
	workspaceId,
	environment
}: {
	userId: string;
	workspaceId: string;
	environment: string;
}): Promise<ISecret[]> => {
	let secrets: any; // TODO: FIX any
	try {
		// get shared workspace secrets
		const sharedSecrets = await Secret.find({
			workspace: workspaceId,
			environment,
			type: SECRET_SHARED
		});

		// get personal workspace secrets
		const personalSecrets = await Secret.find({
			workspace: workspaceId,
			environment,
			type: SECRET_PERSONAL,
			user: userId
		});

		// concat shared and personal workspace secrets
		secrets = personalSecrets.concat(sharedSecrets);
	} catch (err) {
		Sentry.setUser(null);
		Sentry.captureException(err);
		throw new Error('Failed to pull shared and personal secrets');
	}

	return secrets;
};

/**
 * Reformat output of pullSecrets() to be compatible with how existing
 * clients handle secrets
 * @param {Object} obj
 * @param {Object} obj.secrets
 */
const reformatPullSecrets = ({ secrets }: { secrets: ISecret[] }) => {
	let reformatedSecrets;
	try {
		reformatedSecrets = secrets.map((s) => ({
			_id: s._id,
			workspace: s.workspace,
			type: s.type,
			environment: s.environment,
			secretKey: {
				workspace: s.workspace,
				ciphertext: s.secretKeyCiphertext,
				iv: s.secretKeyIV,
				tag: s.secretKeyTag,
				hash: s.secretKeyHash
			},
			secretValue: {
				workspace: s.workspace,
				ciphertext: s.secretValueCiphertext,
				iv: s.secretValueIV,
				tag: s.secretValueTag,
				hash: s.secretValueHash
			}
		}));
	} catch (err) {
		Sentry.setUser(null);
		Sentry.captureException(err);
		throw new Error('Failed to reformat pulled secrets');
	}

	return reformatedSecrets;
};

/**
 * Return decrypted secrets in format [format]
 * @param {Object} obj
 * @param {Object[]} obj.secrets - array of (encrypted) secret key-value pair objects
 * @param {String} obj.key - symmetric key to decrypt secret key-value pairs
 * @param {String} obj.format - desired return format that is either "text," "object," or "expanded"
 * @return {String|Object} (decrypted) secrets also called the content
 */
const decryptSecrets = ({
	secrets,
	key,
	format
}: {
	secrets: PushSecret[];
	key: string;
	format: DecryptSecretType;
}) => {
	// init content
	let content: any = format === 'text' ? '' : {};

	// decrypt secrets
	secrets.forEach((s, idx) => {
		const secretKey = decryptSymmetric({
			ciphertext: s.ciphertextKey,
			iv: s.ivKey,
			tag: s.tagKey,
			key
		});

		const secretValue = decryptSymmetric({
			ciphertext: s.ciphertextValue,
			iv: s.ivValue,
			tag: s.tagValue,
			key
		});

		switch (format) {
			case 'text':
				content += secretKey;
				content += '=';
				content += secretValue;

				if (idx < secrets.length) {
					content += '\n';
				}
				break;
			case 'object':
				content[secretKey] = secretValue;
				break;
			case 'expanded':
				content[secretKey] = {
					...s,
					plaintextKey: secretKey,
					plaintextValue: secretValue
				};
				break;
		}
	});

	return content;
};

export {
	pushSecrets,
	pullSecrets,
	reformatPullSecrets,
	decryptSecrets
};
