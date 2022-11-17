import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';
import {
	Workspace,
	Membership,
	MembershipOrg,
	Integration,
	IntegrationAuth,
	IUser,
	ServiceToken
} from '../models';
import {
	createWorkspace as create,
	deleteWorkspace as deleteWork
} from '../helpers/workspace';
import { addMemberships } from '../helpers/membership';
import { ADMIN, COMPLETED, GRANTED } from '../variables';

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