import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';
import { Key } from '../models';
import {
	pushSecrets as push,
	pullSecrets as pull,
	reformatPullSecrets
} from '../helpers/secret';
import { pushKeys } from '../helpers/key';
import { ENV_SET } from '../variables';

import { postHogClient } from '../services';

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

/**
 * Upload (encrypted) secrets to workspace with id [workspaceId]
 * for environment [environment]
 * @param req
 * @param res
 * @returns
 */
export const pushSecrets = async (req: Request, res: Response) => {
	// upload (encrypted) secrets to workspace with id [workspaceId]

	try {
		let { secrets }: { secrets: PushSecret[] } = req.body;
		const { keys, environment, channel } = req.body;
		const { workspaceId } = req.params;

		// validate environment
		if (!ENV_SET.has(environment)) {
			throw new Error('Failed to validate environment');
		}

		// sanitize secrets
		secrets = secrets.filter(
			(s: PushSecret) => s.ciphertextKey !== '' && s.ciphertextValue !== ''
		);

		await push({
			userId: req.user._id,
			workspaceId,
			environment,
			secrets
		});

		await pushKeys({
			userId: req.user._id,
			workspaceId,
			keys
		});

		if (postHogClient) {
			postHogClient.capture({
				event: 'secrets pushed',
				distinctId: req.user.email,
				properties: {
					numberOfSecrets: secrets.length,
					environment,
					workspaceId,
					channel: channel ? channel : 'cli'
				}
			});
		}

	} catch (err) {
		Sentry.setUser({ email: req.user.email });
		Sentry.captureException(err);
		return res.status(400).send({
			message: 'Failed to upload workspace secrets'
		});
	}

	return res.status(200).send({
		message: 'Successfully uploaded workspace secrets'
	});
};

/**
 * Return (encrypted) secrets for workspace with id [workspaceId]
 * for environment [environment] and (encrypted) workspace key
 * @param req
 * @param res
 * @returns
 */
export const pullSecrets = async (req: Request, res: Response) => {
	let secrets;
	let key;
	try {
		const environment: string = req.query.environment as string;
		const channel: string = req.query.channel as string;
		const { workspaceId } = req.params;

		// validate environment
		if (!ENV_SET.has(environment)) {
			throw new Error('Failed to validate environment');
		}

		secrets = await pull({
			userId: req.user._id.toString(),
			workspaceId,
			environment
		});

		key = await Key.findOne({
			workspace: workspaceId,
			receiver: req.user._id
		})
			.sort({ createdAt: -1 })
			.populate('sender', '+publicKey');
		
		if (channel !== 'cli') {
			secrets = reformatPullSecrets({ secrets });
		}

		if (postHogClient) {
			// capture secrets pushed event in production
			postHogClient.capture({
				distinctId: req.user.email,
				event: 'secrets pulled',
				properties: {
					numberOfSecrets: secrets.length,
					environment,
					workspaceId,
					channel: channel ? channel : 'cli'
				}
			});
		}
	} catch (err) {
		Sentry.setUser({ email: req.user.email });
		Sentry.captureException(err);
		return res.status(400).send({
			message: 'Failed to pull workspace secrets'
		});
	}

	return res.status(200).send({
		secrets,
		key
	});
};

/**
 * Return (encrypted) secrets for workspace with id [workspaceId]
 * for environment [environment] and (encrypted) workspace key
 * via service token
 * @param req
 * @param res
 * @returns
 */
export const pullSecretsServiceToken = async (req: Request, res: Response) => {
	// get (encrypted) secrets from workspace with id [workspaceId]
	// service token route

	let secrets;
	let key;
	try {
		const environment: string = req.query.environment as string;
		const channel: string = req.query.channel as string;
		const { workspaceId } = req.params;

		// validate environment
		if (!ENV_SET.has(environment)) {
			throw new Error('Failed to validate environment');
		}

		secrets = await pull({
			userId: req.serviceToken.user._id.toString(),
			workspaceId,
			environment
		});

		key = {
			encryptedKey: req.serviceToken.encryptedKey,
			nonce: req.serviceToken.nonce,
			sender: {
				publicKey: req.serviceToken.publicKey
			},
			receiver: req.serviceToken.user,
			workspace: req.serviceToken.workspace
		};

		if (postHogClient) {
			// capture secrets pushed event in production
			postHogClient.capture({
				distinctId: req.serviceToken.user.email,
				event: 'secrets pulled',
				properties: {
					numberOfSecrets: secrets.length,
					environment,
					workspaceId,
					channel: channel ? channel : 'cli'
				}
			});
		}
	} catch (err) {
		Sentry.setUser({ email: req.serviceToken.user.email });
		Sentry.captureException(err);
		return res.status(400).send({
			message: 'Failed to pull workspace secrets'
		});
	}

	return res.status(200).send({
		secrets: reformatPullSecrets({ secrets }),
		key
	});
};
