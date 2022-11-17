import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';
import { NODE_ENV, JWT_SIGNUP_LIFETIME, JWT_SIGNUP_SECRET } from '../config';
import { User, MembershipOrg } from '../models';
import { completeAccount } from '../helpers/user';
import {
	sendEmailVerification,
	checkEmailVerification,
	initializeDefaultOrg
} from '../helpers/signup';
import { issueTokens, createToken } from '../helpers/auth';
import { INVITED, ACCEPTED } from '../variables';

/**
 * Signup step 1: Initialize account for user under email [email] and send a verification code
 * to that email
 * @param req
 * @param res
 * @returns
 */
export const beginEmailSignup = async (req: Request, res: Response) => {
	let email: string;
	try {
		email = req.body.email;

		const user = await User.findOne({ email }).select('+publicKey');
		if (user && user?.publicKey) {
			// case: user has already completed account

			return res.status(403).send({
				error: 'Failed to send email verification code for complete account'
			});
		}

		// send send verification email
		await sendEmailVerification({ email });
	} catch (err) {
		Sentry.setUser(null);
		Sentry.captureException(err);
		return res.status(400).send({
			error: 'Failed to send email verification code'
		});
	}

	return res.status(200).send({
		message: `Sent an email verification code to ${email}`
	});
};

/**
 * Signup step 2: Verify that code [code] was sent to email [email] and issue
 * a temporary signup token for user to complete setting up their account
 * @param req
 * @param res
 * @returns
 */
export const verifyEmailSignup = async (req: Request, res: Response) => {
	let user, token;
	try {
		const { email, code } = req.body;

		// initialize user account
		user = await User.findOne({ email });
		if (user && user?.publicKey) {
			// case: user has already completed account
			return res.status(403).send({
				error: 'Failed email verification for complete user'
			});
		}

		// verify email
		await checkEmailVerification({
			email,
			code
		});

		if (!user) {
			user = await new User({
				email
			}).save();
		}

		// generate temporary signup token
		token = createToken({
			payload: {
				userId: user._id.toString()
			},
			expiresIn: JWT_SIGNUP_LIFETIME,
			secret: JWT_SIGNUP_SECRET
		});
	} catch (err) {
		Sentry.setUser(null);
		Sentry.captureException(err);
		return res.status(400).send({
			error: 'Failed email verification'
		});
	}

	return res.status(200).send({
		message: 'Successfuly verified email',
		user,
		token
	});
};

/**
 * Complete setting up user by adding their personal and auth information as part of the
 * signup flow
 * @param req
 * @param res
 * @returns
 */
export const completeAccountSignup = async (req: Request, res: Response) => {
	let user, token, refreshToken;
	try {
		const {
			email,
			firstName,
			lastName,
			publicKey,
			encryptedPrivateKey,
			iv,
			tag,
			salt,
			verifier,
			organizationName
		} = req.body;

		// get user
		user = await User.findOne({ email });
		
		if (!user || (user && user?.publicKey)) {
			// case 1: user doesn't exist.
			// case 2: user has already completed account
			return res.status(403).send({
				error: 'Failed to complete account for complete user'
			});
		}

		// complete setting up user's account
		user = await completeAccount({
			userId: user._id.toString(),
			firstName,
			lastName,
			publicKey,
			encryptedPrivateKey,
			iv,
			tag,
			salt,
			verifier
		});

		if (!user)
			throw new Error('Failed to complete account for non-existent user'); // ensure user is non-null

		// initialize default organization and workspace
		await initializeDefaultOrg({
			organizationName,
			user
		});

		// update organization membership statuses that are
		// invited to completed with user attached
		await MembershipOrg.updateMany(
			{
				inviteEmail: email,
				status: INVITED
			},
			{
				user,
				status: ACCEPTED
			}
		);

		// issue tokens
		const tokens = await issueTokens({
			userId: user._id.toString()
		});

		token = tokens.token;
		refreshToken = tokens.refreshToken;
	} catch (err) {
		Sentry.setUser(null);
		Sentry.captureException(err);
		return res.status(400).send({
			message: 'Failed to complete account setup'
		});
	}

	return res.status(200).send({
		message: 'Successfully set up account',
		user,
		token,
		refreshToken
	});
};
/**
 * Complete setting up user by adding their personal and auth information as part of the
 * invite flow
 * @param req
 * @param res
 * @returns
 */
export const completeAccountInvite = async (req: Request, res: Response) => {
	let user, token, refreshToken;
	try {
		const {
			email,
			firstName,
			lastName,
			publicKey,
			encryptedPrivateKey,
			iv,
			tag,
			salt,
			verifier
		} = req.body;

		// get user
		user = await User.findOne({ email });

		if (!user || (user && user?.publicKey)) {
			// case 1: user doesn't exist.
			// case 2: user has already completed account
			return res.status(403).send({
				error: 'Failed to complete account for complete user'
			});
		}

		const membershipOrg = await MembershipOrg.findOne({
			inviteEmail: email,
			status: INVITED
		});

		if (!membershipOrg) throw new Error('Failed to find invitations for email');

		// complete setting up user's account
		user = await completeAccount({
			userId: user._id.toString(),
			firstName,
			lastName,
			publicKey,
			encryptedPrivateKey,
			iv,
			tag,
			salt,
			verifier
		});

		if (!user)
			throw new Error('Failed to complete account for non-existent user');

		// update organization membership statuses that are
		// invited to completed with user attached
		await MembershipOrg.updateMany(
			{
				inviteEmail: email,
				status: INVITED
			},
			{
				user,
				status: ACCEPTED
			}
		);

		// issue tokens
		const tokens = await issueTokens({
			userId: user._id.toString()
		});

		token = tokens.token;
		refreshToken = tokens.refreshToken;
	} catch (err) {
		Sentry.setUser(null);
		Sentry.captureException(err);
		return res.status(400).send({
			message: 'Failed to complete account setup'
		});
	}

	return res.status(200).send({
		message: 'Successfully set up account',
		user,
		token,
		refreshToken
	});
};
