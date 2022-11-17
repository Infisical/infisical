import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';
import { Key } from '../models';
import { findMembership } from '../helpers/membership';
import { PUBLIC_KEY } from '../config';
import { GRANTED } from '../variables';

/**
 * Add (encrypted) copy of workspace key for workspace with id [workspaceId] for user with
 * id [key.userId]
 * @param req
 * @param res
 * @returns
 */
export const uploadKey = async (req: Request, res: Response) => {
	try {
		const { workspaceId } = req.params;
		const { key } = req.body;

		// validate membership of sender
		const senderMembership = await findMembership({
			user: req.user._id,
			workspace: workspaceId
		});

		if (!senderMembership) {
			throw new Error('Failed sender membership validation for workspace');
		}

		// validate membership of receiver
		const receiverMembership = await findMembership({
			user: key.userId,
			workspace: workspaceId
		});

		if (!receiverMembership) {
			throw new Error('Failed receiver membership validation for workspace');
		}

		receiverMembership.status = GRANTED;
		await receiverMembership.save();

		await new Key({
			encryptedKey: key.encryptedKey,
			nonce: key.nonce,
			sender: req.user._id,
			receiver: key.userId,
			workspace: workspaceId
		}).save();
	} catch (err) {
		Sentry.setUser({ email: req.user.email });
		Sentry.captureException(err);
		return res.status(400).send({
			message: 'Failed to upload key to workspace'
		});
	}

	return res.status(200).send({
		message: 'Successfully uploaded key to workspace'
	});
};

/**
 * Return latest (encrypted) copy of workspace key for user
 * @param req
 * @param res
 * @returns
 */
export const getLatestKey = async (req: Request, res: Response) => {
	let latestKey;
	try {
		const { workspaceId } = req.params;

		// get latest key
		latestKey = await Key.find({
			workspace: workspaceId,
			receiver: req.user._id
		})
			.sort({ createdAt: -1 })
			.limit(1)
			.populate('sender', '+publicKey');
	} catch (err) {
		Sentry.setUser({ email: req.user.email });
		Sentry.captureException(err);
		return res.status(400).send({
			message: 'Failed to get latest key'
		});
	}

	const resObj: any = {};

	if (latestKey.length > 0) {
		resObj['latestKey'] = latestKey[0];
	}

	return res.status(200).send(resObj);
};

/**
 * Return public key of Infisical
 * @param req
 * @param res
 * @returns
 */
export const getPublicKeyInfisical = async (req: Request, res: Response) => {
	return res.status(200).send({
		publicKey: PUBLIC_KEY
	});
};
