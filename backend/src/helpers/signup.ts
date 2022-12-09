import * as Sentry from '@sentry/node';
import crypto from 'crypto';
import { Token, IToken, IUser } from '../models';
import { createOrganization } from './organization';
import { addMembershipsOrg } from './membershipOrg';
import { createWorkspace } from './workspace';
import { addMemberships } from './membership';
import { OWNER, ADMIN, ACCEPTED, GRANTED } from '../variables';
import { sendMail } from '../helpers/nodemailer';

/**
 * Send magic link to verify email to [email]
 * for user and workspace.
 * @param {Object} obj
 * @param {String} obj.email - email
 * @returns {Boolean} success - whether or not operation was successful
 *
 */
const sendEmailVerification = async ({ email }: { email: string }) => {
	try {
		const token = String(crypto.randomInt(Math.pow(10, 5), Math.pow(10, 6) - 1));

		await Token.findOneAndUpdate(
			{ email },
			{
				email,
				token,
				createdAt: new Date()
			},
			{ upsert: true, new: true }
		);

		// send mail
		await sendMail({
			template: 'emailVerification.handlebars',
			subjectLine: 'Infisical confirmation code',
			recipients: [email],
			substitutions: {
				code: token
			}
		});
	} catch (err) {
		Sentry.setUser(null);
		Sentry.captureException(err);
		throw new Error(
			"Ouch. We weren't able to send your email verification code"
		);
	}
};

/**
 * Validate [code] sent to [email]
 * @param {Object} obj
 * @param {String} obj.email - emai
 * @param {String} obj.code - code that was sent to [email]
 */
const checkEmailVerification = async ({
	email,
	code
}: {
	email: string;
	code: string;
}) => {
	try {
		const token = await Token.findOneAndDelete({
			email,
			token: code
		});
	
		if (!token) throw new Error('Failed to find email verification token');
	} catch (err) {
		Sentry.setUser(null);
		Sentry.captureException(err);
		throw new Error("Oops. We weren't able to verify");
	}
};

/**
 * Initialize default organization named [organizationName] with workspace
 * for user [user]
 * @param {Object} obj
 * @param {String} obj.organizationName - name of organization to initialize
 * @param {IUser} obj.user - user who we are initializing for
 */
const initializeDefaultOrg = async ({
	organizationName,
	user
}: {
	organizationName: string;
	user: IUser;
}) => {
	try {
		// create organization with user as owner and initialize a free
		// subscription
		const organization = await createOrganization({
			email: user.email,
			name: organizationName
		});

		await addMembershipsOrg({
			userIds: [user._id.toString()],
			organizationId: organization._id.toString(),
			roles: [OWNER],
			statuses: [ACCEPTED]
		});

		// initialize a default workspace inside the new organization
		const workspace = await createWorkspace({
			name: `Example Project`,
			organizationId: organization._id.toString()
		});

		await addMemberships({
			userIds: [user._id.toString()],
			workspaceId: workspace._id.toString(),
			roles: [ADMIN],
			statuses: [GRANTED]
		});
	} catch (err) {
		throw new Error('Failed to initialize default organization and workspace');
	}
};

export { sendEmailVerification, checkEmailVerification, initializeDefaultOrg };
