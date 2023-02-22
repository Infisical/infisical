import * as Sentry from '@sentry/node';
import { IUser, User } from '../models';
import { sendMail } from './nodemailer';

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
 * @param {Number} obj.encryptionVersion - version of auth encryption scheme used
 * @param {String} obj.protectedKey - protected key in encryption version 2
 * @param {String} obj.protectedKeyIV - IV of protected key in encryption version 2
 * @param {String} obj.protectedKeyTag - tag of protected key in encryption version 2
 * @param {String} obj.publicKey - publickey of user
 * @param {String} obj.encryptedPrivateKey - (encrypted) private key of user
 * @param {String} obj.encryptedPrivateKeyIV - iv for (encrypted) private key of user
 * @param {String} obj.encryptedPrivateKeyTag - tag for (encrypted) private key of user
 * @param {String} obj.salt - salt for auth SRP
 * @param {String} obj.verifier - verifier for auth SRP
 * @returns {Object} user - the completed user
 */
const completeAccount = async ({
	userId,
	firstName,
	lastName,
	encryptionVersion,
	protectedKey,
	protectedKeyIV,
	protectedKeyTag,
	publicKey,
	encryptedPrivateKey,
	encryptedPrivateKeyIV,
	encryptedPrivateKeyTag,
	salt,
	verifier
}: {
	userId: string;
	firstName: string;
	lastName: string;
	encryptionVersion: number;
	protectedKey: string;
	protectedKeyIV: string;
	protectedKeyTag: string;
	publicKey: string;
	encryptedPrivateKey: string;
	encryptedPrivateKeyIV: string;
	encryptedPrivateKeyTag: string;
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
				encryptionVersion,
				protectedKey,
				protectedKeyIV,
				protectedKeyTag,
				publicKey,
				encryptedPrivateKey,
				iv: encryptedPrivateKeyIV,
				tag: encryptedPrivateKeyTag,
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

/**
 * Check if device with ip [ip] and user-agent [userAgent] has been seen for user [user].
 * If the device is unseen, then notify the user of the new device
 * @param {Object} obj
 * @param {String} obj.ip - login ip address
 * @param {String} obj.userAgent - login user-agent
 */
const checkUserDevice = async ({
	user,
	ip,
	userAgent
}: {
	user: IUser;
	ip: string;
	userAgent: string;
}) => {
	const isDeviceSeen = user.devices.some((device) => device.ip === ip && device.userAgent === userAgent);
		
	if (!isDeviceSeen) {
		// case: unseen login ip detected for user
		// -> notify user about the sign-in from new ip 
		
		user.devices = user.devices.concat([{
			ip: String(ip),
			userAgent
		}]);
		
		await user.save();

		// send MFA code [code] to [email]
		await sendMail({
			template: 'newDevice.handlebars',
			subjectLine: `Successful login from new device`,
			recipients: [user.email],
			substitutions: {
				email: user.email,
				timestamp: new Date().toString(),
				ip,
				userAgent
			}
		}); 
	}
}

export { setupAccount, completeAccount, checkUserDevice };
