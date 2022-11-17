import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';
const jsrp = require('jsrp');
import * as bigintConversion from 'bigint-conversion';
import { User, BackupPrivateKey } from '../models';

const clientPublicKeys: any = {};

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
		Sentry.setUser(null);
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
		Sentry.setUser(null);
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
		Sentry.setUser(null);
		Sentry.captureException(err);
		return res.status(400).send({
			message: 'Failed to update backup private key'
		});
	}
};
