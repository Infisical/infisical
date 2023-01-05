import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';
import {
    Key,
	ServiceTokenData
} from '../../models';
import {
	v2PushSecrets as push,
	pullSecrets as pull,
	reformatPullSecrets
} from '../../helpers/secret';
import { pushKeys } from '../../helpers/key';
import { postHogClient, EventService } from '../../services';
import { eventPushSecrets } from '../../events';
import { ENV_SET } from '../../variables';

interface V2PushSecret {
	type: string; // personal or shared
	secretKeyCiphertext: string;
	secretKeyIV: string;
	secretKeyTag: string;
	secretKeyHash: string;
	secretValueCiphertext: string;
	secretValueIV: string;
	secretValueTag: string;
	secretValueHash: string;
	secretCommentCiphertext?: string;
	secretCommentIV?: string;
	secretCommentTag?: string;
	secretCommentHash?: string;
}

/**
 * Upload (encrypted) secrets to workspace with id [workspaceId]
 * for environment [environment]
 * @param req
 * @param res
 * @returns
 */
export const pushWorkspaceSecrets = async (req: Request, res: Response) => {
	// upload (encrypted) secrets to workspace with id [workspaceId]
	try {
		let { secrets }: { secrets: V2PushSecret[] } = req.body;
		const { keys, environment, channel } = req.body;
		const { workspaceId } = req.params;

		// validate environment
		if (!ENV_SET.has(environment)) {
			throw new Error('Failed to validate environment');
		}

		// sanitize secrets
		secrets = secrets.filter(
			(s: V2PushSecret) => s.secretKeyCiphertext !== '' && s.secretValueCiphertext !== ''
		);

		await push({
			userId: req.user._id,
			workspaceId,
			environment,
			secrets,
			channel: channel ? channel : 'cli',
			ipAddress: req.ip
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

		// trigger event - push secrets
		EventService.handleEvent({
			event: eventPushSecrets({
				workspaceId
			})
		});

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
 * for environment [environment]
 * @param req
 * @param res
 * @returns
 */
export const pullSecrets = async (req: Request, res: Response) => {
	let secrets;
	try {
		const environment: string = req.query.environment as string;
		const channel: string = req.query.channel as string;
		const { workspaceId } = req.params;
		
		let userId;
		if (req.user) {
			userId = req.user._id.toString();
		} else if (req.serviceTokenData) {
			userId = req.serviceTokenData.user._id
		}

		secrets = await pull({
			userId,
			workspaceId,
			environment,
			channel,
			ipAddress: req.ip
		});
		
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
		secrets
	});
};

export const getWorkspaceKey = async (req: Request, res: Response) => {
	let key;
	try {
		const { workspaceId } = req.params;

		key = await Key.findOne({
			workspace: workspaceId,
			receiver: req.user._id
		}).populate('sender', '+publicKey');
		
		if (!key) throw new Error('Failed to find workspace key');
	} catch (err) {
		Sentry.setUser({ email: req.user.email });
		Sentry.captureException(err);
		return res.status(400).send({
			message: 'Failed to get workspace key'
		});
	}

	return res.status(200).send({
		key
	});
}
export const getWorkspaceServiceTokenData = async (
	req: Request,
	res: Response
) => {
	let serviceTokenData;
	try {
		const { workspaceId } = req.params;

		serviceTokenData = await ServiceTokenData
			.find({
				workspace: workspaceId
			})
			.select('+encryptedKey +iv +tag');

	} catch (err) {
		Sentry.setUser({ email: req.user.email });
		Sentry.captureException(err);
		return res.status(400).send({
			message: 'Failed to get workspace service token data'
		});
	}
	
	return res.status(200).send({
		serviceTokenData
	});
}