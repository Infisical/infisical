import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';
import {
	Workspace,
	Membership,
	MembershipOrg,
	Integration,
	IntegrationAuth,
    Key,
	IUser,
	ServiceToken,
} from '../../models';
import {
	createWorkspace as create,
	deleteWorkspace as deleteWork
} from '../../helpers/workspace';
import {
	v2PushSecrets as push,
	pullSecrets as pull,
	reformatPullSecrets
} from '../../helpers/secret';
import { pushKeys } from '../../helpers/key';
import { addMemberships } from '../../helpers/membership';
import { postHogClient, EventService } from '../../services';
import { eventPushSecrets } from '../../events';
import { ADMIN, COMPLETED, GRANTED, ENV_SET } from '../../variables';
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
 * Return public keys of members of workspace with id [workspaceId]
 * @param req
 * @param res
 * @returns
 */
export const getWorkspacePublicKeys = async (req: Request, res: Response) => {
	let publicKeys;
	try {
		const { workspaceId } = req.params;

		publicKeys = (
			await Membership.find({
				workspace: workspaceId
			}).populate<{ user: IUser }>('user', 'publicKey')
		)
			.filter((m) => m.status === COMPLETED || m.status === GRANTED)
			.map((member) => {
				return {
					publicKey: member.user.publicKey,
					userId: member.user._id
				};
			});
	} catch (err) {
		Sentry.setUser({ email: req.user.email });
		Sentry.captureException(err);
		return res.status(400).send({
			message: 'Failed to get workspace member public keys'
		});
	}

	return res.status(200).send({
		publicKeys
	});
};

/**
 * Return memberships for workspace with id [workspaceId]
 * @param req
 * @param res
 * @returns
 */
export const getWorkspaceMemberships = async (req: Request, res: Response) => {
	let users;
	try {
		const { workspaceId } = req.params;

		users = await Membership.find({
			workspace: workspaceId
		}).populate('user', '+publicKey');
	} catch (err) {
		Sentry.setUser({ email: req.user.email });
		Sentry.captureException(err);
		return res.status(400).send({
			message: 'Failed to get workspace members'
		});
	}

	return res.status(200).send({
		users
	});
};

/**
 * Return workspaces that user is part of
 * @param req
 * @param res
 * @returns
 */
export const getWorkspaces = async (req: Request, res: Response) => {
	let workspaces;
	try {
		workspaces = (
			await Membership.find({
				user: req.user._id
			}).populate('workspace')
		).map((m) => m.workspace);
	} catch (err) {
		Sentry.setUser({ email: req.user.email });
		Sentry.captureException(err);
		return res.status(400).send({
			message: 'Failed to get workspaces'
		});
	}

	return res.status(200).send({
		workspaces
	});
};

/**
 * Return workspace with id [workspaceId]
 * @param req
 * @param res
 * @returns
 */
export const getWorkspace = async (req: Request, res: Response) => {
	let workspace;
	try {
		const { workspaceId } = req.params;

		workspace = await Workspace.findOne({
			_id: workspaceId
		});
	} catch (err) {
		Sentry.setUser({ email: req.user.email });
		Sentry.captureException(err);
		return res.status(400).send({
			message: 'Failed to get workspace'
		});
	}

	return res.status(200).send({
		workspace
	});
};

/**
 * Create new workspace named [workspaceName] under organization with id
 * [organizationId] and add user as admin
 * @param req
 * @param res
 * @returns
 */
export const createWorkspace = async (req: Request, res: Response) => {
	let workspace;
	try {
		const { workspaceName, organizationId } = req.body;

		// validate organization membership
		const membershipOrg = await MembershipOrg.findOne({
			user: req.user._id,
			organization: organizationId
		});

		if (!membershipOrg) {
			throw new Error('Failed to validate organization membership');
		}

		if (workspaceName.length < 1) {
			throw new Error('Workspace names must be at least 1-character long');
		}

		// create workspace and add user as member
		workspace = await create({
			name: workspaceName,
			organizationId
		});

		await addMemberships({
			userIds: [req.user._id],
			workspaceId: workspace._id.toString(),
			roles: [ADMIN],
			statuses: [GRANTED]
		});
	} catch (err) {
		Sentry.setUser({ email: req.user.email });
		Sentry.captureException(err);
		return res.status(400).send({
			message: 'Failed to create workspace'
		});
	}

	return res.status(200).send({
		workspace
	});
};

/**
 * Delete workspace with id [workspaceId]
 * @param req
 * @param res
 * @returns
 */
export const deleteWorkspace = async (req: Request, res: Response) => {
	try {
		const { workspaceId } = req.params;

		// delete workspace
		await deleteWork({
			id: workspaceId
		});
	} catch (err) {
		Sentry.setUser({ email: req.user.email });
		Sentry.captureException(err);
		return res.status(400).send({
			message: 'Failed to delete workspace'
		});
	}

	return res.status(200).send({
		message: 'Successfully deleted workspace'
	});
};

/**
 * Change name of workspace with id [workspaceId] to [name]
 * @param req
 * @param res
 * @returns
 */
export const changeWorkspaceName = async (req: Request, res: Response) => {
	let workspace;
	try {
		const { workspaceId } = req.params;
		const { name } = req.body;

		workspace = await Workspace.findOneAndUpdate(
			{
				_id: workspaceId
			},
			{
				name
			},
			{
				new: true
			}
		);
	} catch (err) {
		Sentry.setUser({ email: req.user.email });
		Sentry.captureException(err);
		return res.status(400).send({
			message: 'Failed to change workspace name'
		});
	}

	return res.status(200).send({
		message: 'Successfully changed workspace name',
		workspace
	});
};

/**
 * Return integrations for workspace with id [workspaceId]
 * @param req
 * @param res
 * @returns
 */
export const getWorkspaceIntegrations = async (req: Request, res: Response) => {
	let integrations;
	try {
		const { workspaceId } = req.params;

		integrations = await Integration.find({
			workspace: workspaceId
		});
	} catch (err) {
		Sentry.setUser({ email: req.user.email });
		Sentry.captureException(err);
		return res.status(400).send({
			message: 'Failed to get workspace integrations'
		});
	}

	return res.status(200).send({
		integrations
	});
};

/**
 * Return (integration) authorizations for workspace with id [workspaceId]
 * @param req
 * @param res
 * @returns
 */
export const getWorkspaceIntegrationAuthorizations = async (
	req: Request,
	res: Response
) => {
	let authorizations;
	try {
		const { workspaceId } = req.params;

		authorizations = await IntegrationAuth.find({
			workspace: workspaceId
		});
	} catch (err) {
		Sentry.setUser({ email: req.user.email });
		Sentry.captureException(err);
		return res.status(400).send({
			message: 'Failed to get workspace integration authorizations'
		});
	}

	return res.status(200).send({
		authorizations
	});
};

/**
 * Return service service tokens for workspace [workspaceId] belonging to user
 * @param req 
 * @param res 
 * @returns 
 */
export const getWorkspaceServiceTokens = async (
	req: Request,
	res: Response
) => {
	let serviceTokens;
	try {
		const { workspaceId } = req.params;

		serviceTokens = await ServiceToken.find({
			user: req.user._id,
			workspace: workspaceId
		});
	} catch (err) {
		Sentry.setUser({ email: req.user.email });
		Sentry.captureException(err);
		return res.status(400).send({
			message: 'Failed to get workspace service tokens'
		});
	}
	
	return res.status(200).send({
		serviceTokens
	});
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
 * for environment [environment] and (encrypted) workspace key
 * @param req
 * @param res
 * @returns
 */
export const pullSecrets = async (req: Request, res: Response) => {
	// TODO: only return secrets, do not return workspace key

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

// TODO: modify based on upcoming serviceTokenData changes

/**
 * Return (encrypted) secrets for workspace with id [workspaceId]
 * for environment [environment] and (encrypted) workspace key
 * via service token
 * @param req
 * @param res
 * @returns
 */
 export const pullSecretsServiceToken = async (req: Request, res: Response) => {
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
			// capture secrets pulled event in production
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