import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';
import crypto from 'crypto';
const jsrp = require('jsrp');
import * as bigintConversion from 'bigint-conversion';
import { User, Token, BackupPrivateKey } from '../models';
import { checkEmailVerification } from '../helpers/signup';
import { createToken } from '../helpers/auth';
import { sendMail } from '../helpers/nodemailer';
import { JWT_SIGNUP_LIFETIME, JWT_SIGNUP_SECRET, SITE_URL } from '../config';

const clientPublicKeys: any = {};

/**
 * Password reset step 1: Send email verification link to email [email] 
 * for account recovery.
 * @param req
 * @param res
 * @returns
 */
export const emailPasswordReset = async (req: Request, res: Response) => {
	let email: string;
	try {
		email = req.body.email;

		const user = await User.findOne({ email }).select('+publicKey');
		if (!user || !user?.publicKey) {
			// case: user has already completed account

			return res.status(403).send({
				error: 'Failed to send email verification for password reset'
			});
		}
		
		const token = crypto.randomBytes(16).toString('hex');

		await Token.findOneAndUpdate(
			{ email },
			{
				email,
				token,
				createdAt: new Date()
			},
			{ upsert: true, new: true }
		);
		
		await sendMail({
			template: 'passwordReset.handlebars',
			subjectLine: 'Infisical password reset',
			recipients: [email],
			substitutions: {
				email,
				token,
				callback_url: SITE_URL + '/password-reset'
			}
		});
		
	} catch (err) {
		Sentry.setUser(null);
		Sentry.captureException(err);
		return res.status(400).send({
			message: 'Failed to send email for account recovery'
		});	
	}
	
	return res.status(200).send({
		message: `Sent an email for account recovery to ${email}`
	});
}

/**
 * Password reset step 2: Verify email verification link sent to email [email]
 * @param req 
 * @param res 
 * @returns 
 */
export const emailPasswordResetVerify = async (req: Request, res: Response) => {
	let user, token;
	try {
		const { email, code } = req.body;
		
		user = await User.findOne({ email }).select('+publicKey');
		if (!user || !user?.publicKey) {
			// case: user doesn't exist with email [email] or 
			// hasn't even completed their account
			return res.status(403).send({
				error: 'Failed email verification for password reset'
			});
		}

		await checkEmailVerification({
			email,
			code
		});
		
		// generate temporary password-reset token
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
			message: 'Failed email verification for password reset'
		});	
	}

	return res.status(200).send({
		message: 'Successfully verified email',
		user,
		token
	});
}

/**
 * Return [salt] and [serverPublicKey] as part of step 1 of SRP protocol
 * @param req
 * @param res
 * @returns
 */
export const srp1 = async (req: Request, res: Response) => {
	// return salt, serverPublicKey as part of first step of SRP protocol
	try {
		const { clientPublicKey } = req.body;
		const user = await User.findOne({
			email: req.user.email
		}).select('+salt +verifier');
		
		if (!user) throw new Error('Failed to find user');

		const server = new jsrp.server();
		server.init(
			{
				salt: user.salt,
				verifier: user.verifier
			},
			() => {
				// generate server-side public key
				const serverPublicKey = server.getPublicKey();
				clientPublicKeys[req.user.email] = {
					clientPublicKey,
					serverBInt: bigintConversion.bigintToBuf(server.bInt)
				};

				return res.status(200).send({
					serverPublicKey,
					salt: user.salt
				});
			}
		);
	} catch (err) {
		Sentry.setUser({ email: req.user.email });
		Sentry.captureException(err);
		return res.status(400).send({
			error: 'Failed to start change password process'
		});
	}
};

/**
 * Change account SRP authentication information for user
 * Requires verifying [clientProof] as part of step 2 of SRP protocol
 * as initiated in POST /srp1
 * @param req
 * @param res
 * @returns
 */
export const changePassword = async (req: Request, res: Response) => {
	try {
		const { clientProof, encryptedPrivateKey, iv, tag, salt, verifier } =
			req.body;
		const user = await User.findOne({
			email: req.user.email
		}).select('+salt +verifier');

		if (!user) throw new Error('Failed to find user');

		const server = new jsrp.server();
		server.init(
			{
				salt: user.salt,
				verifier: user.verifier,
				b: clientPublicKeys[req.user.email].serverBInt
			},
			async () => {
				server.setClientPublicKey(
					clientPublicKeys[req.user.email].clientPublicKey
				);

				// compare server and client shared keys
				if (server.checkClientProof(clientProof)) {
					// change password

					await User.findByIdAndUpdate(
						req.user._id.toString(),
						{
							encryptedPrivateKey,
							iv,
							tag,
							salt,
							verifier
						},
						{
							new: true
						}
					);

					return res.status(200).send({
						message: 'Successfully changed password'
					});
				}

				return res.status(400).send({
					error: 'Failed to change password. Try again?'
				});
			}
		);
	} catch (err) {
		Sentry.setUser({ email: req.user.email });
		Sentry.captureException(err);
		return res.status(400).send({
			error: 'Failed to change password. Try again?'
		});
	}
};

/**
 * Create or change backup private key for user
 * @param req
 * @param res
 * @returns
 */
export const createBackupPrivateKey = async (req: Request, res: Response) => {
	// create/change backup private key
	// requires verifying [clientProof] as part of second step of SRP protocol
	// as initiated in /srp1

	try {
		const { clientProof, encryptedPrivateKey, iv, tag, salt, verifier } =
			req.body;
		const user = await User.findOne({
			email: req.user.email
		}).select('+salt +verifier');

		if (!user) throw new Error('Failed to find user');

		const server = new jsrp.server();
		server.init(
			{
				salt: user.salt,
				verifier: user.verifier,
				b: clientPublicKeys[req.user.email].serverBInt
			},
			async () => {
				server.setClientPublicKey(
					clientPublicKeys[req.user.email].clientPublicKey
				);

				// compare server and client shared keys
				if (server.checkClientProof(clientProof)) {
					// create new or replace backup private key

					const backupPrivateKey = await BackupPrivateKey.findOneAndUpdate(
						{ user: req.user._id },
						{
							user: req.user._id,
							encryptedPrivateKey,
							iv,
							tag,
							salt,
							verifier
						},
						{ upsert: true, new: true }
					).select('+user, encryptedPrivateKey');

					// issue tokens
					return res.status(200).send({
						message: 'Successfully updated backup private key',
						backupPrivateKey
					});
				}

				return res.status(400).send({
					message: 'Failed to update backup private key'
				});
			}
		);
	} catch (err) {
		Sentry.setUser({ email: req.user.email });
		Sentry.captureException(err);
		return res.status(400).send({
			message: 'Failed to update backup private key'
		});
	}
};

/**
 * Return backup private key for user
 * @param req 
 * @param res 
 * @returns 
 */
export const getBackupPrivateKey = async (req: Request, res: Response) => {
	let backupPrivateKey;
	try {
		backupPrivateKey = await BackupPrivateKey.findOne({
			user: req.user._id
		}).select('+encryptedPrivateKey +iv +tag');
		
		if (!backupPrivateKey) throw new Error('Failed to find backup private key');
	} catch (err) {
		Sentry.setUser({ email: req.user.email});
		Sentry.captureException(err);
		return res.status(400).send({
			message: 'Failed to get backup private key'
		});
	}
	
	return res.status(200).send({
		backupPrivateKey
	});
}

export const resetPassword = async (req: Request, res: Response) => {
	try {
		const {
			encryptedPrivateKey,
			iv,
			tag,
			salt,
			verifier,
		} = req.body;

		await User.findByIdAndUpdate(
			req.user._id.toString(),
			{
				encryptedPrivateKey,
				iv,
				tag,
				salt,
				verifier
			},
			{
				new: true
			}
		);	
	} catch (err) {
		Sentry.setUser({ email: req.user.email});
		Sentry.captureException(err);
		return res.status(400).send({
			message: 'Failed to get backup private key'
		});	
	}
	
	return res.status(200).send({
		message: 'Successfully reset password'
	});
}