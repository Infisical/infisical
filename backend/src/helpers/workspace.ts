import * as Sentry from '@sentry/node';
import crypto from 'crypto';
import { Types } from 'mongoose';
import {
	Workspace,
	Bot,
	Membership,
	Key,
	Secret,
	User,
	IUser,
	ServiceAccountWorkspacePermission,
	ServiceAccount,
	IServiceAccount,
	ServiceTokenData,
	IServiceTokenData,
	SecretBlindIndexData
} from '../models';
import { createBot } from '../helpers/bot';
import { validateUserClientForWorkspace } from '../helpers/user';
import { validateServiceAccountClientForWorkspace } from '../helpers/serviceAccount';
import { validateServiceTokenDataClientForWorkspace } from '../helpers/serviceTokenData';
import { validateMembership } from '../helpers/membership';
import { UnauthorizedRequestError, WorkspaceNotFoundError } from '../utils/errors';
import {
	AUTH_MODE_JWT,
	AUTH_MODE_SERVICE_ACCOUNT,
	AUTH_MODE_SERVICE_TOKEN,
	AUTH_MODE_API_KEY
} from '../variables';
import { SecretService } from '../services';

/**
 * Validate authenticated clients for workspace with id [workspaceId] based
 * on any known permissions.
 * @param {Object} obj
 * @param {Object} obj.authData - authenticated client details
 * @param {Types.ObjectId} obj.workspaceId - id of workspace to validate against
 * @param {String} obj.environment - (optional) environment in workspace to validate against
 * @param {Array<'admin' | 'member'>} obj.acceptedRoles - accepted workspace roles
 * @param {String[]} obj.requiredPermissions - required permissions as part of the endpoint
 */
const validateClientForWorkspace = async ({
	authData,
	workspaceId,
	environment,
	acceptedRoles,
	requiredPermissions,
	requireBlindIndicesEnabled
}: {
	authData: {
		authMode: string;
		authPayload: IUser | IServiceAccount | IServiceTokenData;
	};
	workspaceId: Types.ObjectId;
	environment?: string;
	acceptedRoles: Array<'admin' | 'member'>;
	requiredPermissions?: string[];
	requireBlindIndicesEnabled: boolean;
}) => {
	
	const workspace = await Workspace.findById(workspaceId);

	if (!workspace) throw WorkspaceNotFoundError({
		message: 'Failed to find workspace'
	});

	if (requireBlindIndicesEnabled) {
		// case: blind indices are not enabled for secrets in this workspace
		// (i.e. workspace was created before blind indices were introduced
		// and no admin has enabled it)
		
		const secretBlindIndexData = await SecretBlindIndexData.exists({
			workspace: new Types.ObjectId(workspaceId)
		});
		
		if (!secretBlindIndexData) throw UnauthorizedRequestError({
			message: 'Failed workspace authorization due to blind indices not being enabled'
		});
	}

	if (authData.authMode === AUTH_MODE_JWT && authData.authPayload instanceof User) {
		const membership = await validateUserClientForWorkspace({
			user: authData.authPayload,
			workspaceId,
			environment,
			acceptedRoles,
			requiredPermissions
		});
		
		return ({ membership });
	}

	if (authData.authMode === AUTH_MODE_SERVICE_ACCOUNT && authData.authPayload instanceof ServiceAccount) {
		await validateServiceAccountClientForWorkspace({
			serviceAccount: authData.authPayload,
			workspaceId,
			environment,
			requiredPermissions
		});
		
		return {};
	}
	
	if (authData.authMode === AUTH_MODE_SERVICE_TOKEN && authData.authPayload instanceof ServiceTokenData) {
		await validateServiceTokenDataClientForWorkspace({
			serviceTokenData: authData.authPayload,
			workspaceId,
			environment,
			requiredPermissions
		});

		return {};
	}

	if (authData.authMode === AUTH_MODE_API_KEY && authData.authPayload instanceof User) {
		const membership = await validateUserClientForWorkspace({
			user: authData.authPayload,
			workspaceId,
			environment,
			acceptedRoles,
			requiredPermissions
		});
		
		return ({ membership });
	}
	
	throw UnauthorizedRequestError({
		message: 'Failed client authorization for workspace'
	});
}

/**
 * Create a workspace with name [name] in organization with id [organizationId]
 * and a bot for it.
 * @param {String} name - name of workspace to create.
 * @param {String} organizationId - id of organization to create workspace in
 * @param {Object} workspace - new workspace
 */
const createWorkspace = async ({
	name,
	organizationId
}: {
	name: string;
	organizationId: string;
}) => {
	let workspace;
	try {
		// create workspace
		workspace = await new Workspace({
			name,
			organization: organizationId,
			autoCapitalization: true
		}).save();
		
		// initialize bot for workspace
		await createBot({
			name: 'Infisical Bot',
			workspaceId: workspace._id
		});
		
		// initialize blind index salt for workspace
		await SecretService.createSecretBlindIndexData({
			workspaceId: workspace._id
		});

	} catch (err) {
		Sentry.setUser(null);
		Sentry.captureException(err);
		throw new Error('Failed to create workspace');
	}

	return workspace;
};

/**
 * Delete workspace and all associated materials including memberships,
 * secrets, keys, etc.
 * @param {Object} obj
 * @param {String} obj.id - id of workspace to delete
 */
const deleteWorkspace = async ({ id }: { id: string }) => {
	try {
		await Workspace.deleteOne({ _id: id });
		await Bot.deleteOne({
			workspace: id
		});
		await Membership.deleteMany({
			workspace: id
		});
		await Secret.deleteMany({
			workspace: id
		});
		await Key.deleteMany({
			workspace: id
		});
	} catch (err) {
		Sentry.setUser(null);
		Sentry.captureException(err);
		throw new Error('Failed to delete workspace');
	}
};

export {
	validateClientForWorkspace,
	createWorkspace, 
	deleteWorkspace 
};
