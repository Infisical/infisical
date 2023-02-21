import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';
import { User, MembershipOrg } from '../../models';
import { completeAccount } from '../../helpers/user';
import {
	initializeDefaultOrg
} from '../../helpers/signup';
import { issueAuthTokens } from '../../helpers/auth';
import { INVITED, ACCEPTED } from '../../variables';
import { NODE_ENV } from '../../config';
import axios from 'axios';

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
            protectedKey,
            protectedKeyIV,
            protectedKeyTag,
			publicKey,
			encryptedPrivateKey,
			encryptedPrivateKeyIV,
			encryptedPrivateKeyTag,
			salt,
			verifier,
			organizationName
		}: {
			email: string;
			firstName: string;
			lastName: string;
            protectedKey: string;
            protectedKeyIV: string;
            protectedKeyTag: string;
			publicKey: string;
			encryptedPrivateKey: string;
			encryptedPrivateKeyIV: string;
			encryptedPrivateKeyTag: string;
			salt: string;
			verifier: string;
			organizationName: string;
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
            encryptionVersion: 2,
            protectedKey,
            protectedKeyIV,
            protectedKeyTag,
			publicKey,
			encryptedPrivateKey,
			encryptedPrivateKeyIV,
			encryptedPrivateKeyTag,
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
		const tokens = await issueAuthTokens({
			userId: user._id.toString()
		});

		token = tokens.token;

		// sending a welcome email to new users
		if (process.env.LOOPS_API_KEY) {
			await axios.post("https://app.loops.so/api/v1/events/send", {
				"email": email,
				"eventName": "Sign Up",
				"firstName": firstName,
				"lastName": lastName
			}, {
				headers: {
					"Accept": "application/json",
					"Authorization": "Bearer " + process.env.LOOPS_API_KEY
				},
			});
		}

		// store (refresh) token in httpOnly cookie
		res.cookie('jid', tokens.refreshToken, {
			httpOnly: true,
			path: '/',
			sameSite: 'strict',
			secure: NODE_ENV === 'production' ? true : false
		});
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
		token
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
            protectedKey,
            protectedKeyIV,
            protectedKeyTag,
			publicKey,
			encryptedPrivateKey,
			encryptedPrivateKeyIV,
			encryptedPrivateKeyTag,
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
            encryptionVersion: 2,
            protectedKey,
            protectedKeyIV,
            protectedKeyTag,
			publicKey,
			encryptedPrivateKey,
			encryptedPrivateKeyIV,
			encryptedPrivateKeyTag,
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
		const tokens = await issueAuthTokens({
			userId: user._id.toString()
		});

		token = tokens.token;

		// store (refresh) token in httpOnly cookie
		res.cookie('jid', tokens.refreshToken, {
			httpOnly: true,
			path: '/',
			sameSite: 'strict',
			secure: NODE_ENV === 'production' ? true : false
		});
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
		token
	});
};