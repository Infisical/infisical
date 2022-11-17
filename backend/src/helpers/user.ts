import * as Sentry from '@sentry/node';
import { User, IUser } from '../models';

/**
 * Initialize a user under email [email]
 * @param {Object} obj
 * @param {String} obj.email - email of user to initialize
 * @returns {Object} user - the initialized user
 */
const setupAccount = async ({ email }: { email: string }) => {
	let user;
	try {
		user = await new User({
			email
		}).save();
	} catch (err) {
		Sentry.setUser({ email });
		Sentry.captureException(err);
		throw new Error('Failed to set up account');
	}

	return user;
};

/**
 * Finish setting up user
 * @param {Object} obj
 * @param {String} obj.userId - id of user to finish setting up
 * @param {String} obj.firstName - first name of user
 * @param {String} obj.lastName - last name of user
 * @param {String} obj.publicKey - publickey of user
 * @param {String} obj.encryptedPrivateKey - (encrypted) private key of user
 * @param {String} obj.iv - iv for (encrypted) private key of user
 * @param {String} obj.tag - tag for (encrypted) private key of user
 * @param {String} obj.salt - salt for auth SRP
 * @param {String} obj.verifier - verifier for auth SRP
 * @returns {Object} user - the completed user
 */
const completeAccount = async ({
	userId,
	firstName,
	lastName,
	publicKey,
	encryptedPrivateKey,
	iv,
	tag,
	salt,
	verifier
}: {
	userId: string;
	firstName: string;
	lastName: string;
	publicKey: string;
	encryptedPrivateKey: string;
	iv: string;
	tag: string;
	salt: string;
	verifier: string;
}) => {
	let user;
	try {
		const options = {
			new: true
		};
		user = await User.findByIdAndUpdate(
			userId,
			{
				firstName,
				lastName,
				publicKey,
				encryptedPrivateKey,
				iv,
				tag,
				salt,
				verifier
			},
			options
		);
	} catch (err) {
		Sentry.setUser(null);
		Sentry.captureException(err);
		throw new Error('Failed to complete account set up');
	}

	return user;
};

export { setupAccount, completeAccount };
