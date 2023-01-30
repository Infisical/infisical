import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';
import { JWT_SIGNUP_LIFETIME, JWT_SIGNUP_SECRET } from '../../config';
import { User } from '../../models';
import {
	sendEmailVerification,
	checkEmailVerification,
} from '../../helpers/signup';
import { createToken } from '../../helpers/auth';

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