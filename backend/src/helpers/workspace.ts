import * as Sentry from '@sentry/node';
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
} from '../models';
import { createBot } from '../helpers/bot';
import { validateUserClientForWorkspace } from '../helpers/user';
import { validateServiceAccountClientForWorkspace } from '../helpers/serviceAccount';
import { validateServiceTokenDataClientForWorkspace } from '../helpers/serviceTokenData';
import { validateMembership } from '../helpers/membership';
import { UnauthorizedRequestError } from '../utils/errors';
import {
	AUTH_MODE_JWT,
	AUTH_MODE_SERVICE_ACCOUNT,
	AUTH_MODE_SERVICE_TOKEN,
	AUTH_MODE_API_KEY
} from '../variables';

/**
 * Validate accepted clients for workspace with id [workspaceId] based
 * on any known permissions.
 * @param {Object} obj
 * @param {User} obj.user - user client
 * @param {ServiceAccount} obj.serviceAccount - service account client
 * @param {ServiceTokenData} obj.serviceTokenData - service token client
 * @param {Types.ObjectId} obj.workspaceId - id of workspace to validate against
 * @param {String} obj.environment - (optional) environment in workspace to validate against
 * @param {String[]} obj.requiredPermissions - required permissions as part of the endpoint
 */
const validateClientForWorkspace = async ({
	authData,
	workspaceId,
	environment,
	requiredPermissions
}: {
	authData: {
		authMode: string;
		authPayload: IUser | IServiceAccount | IServiceTokenData;
	},
	workspaceId: Types.ObjectId;
	environment?: string;
	requiredPermissions?: string[];
}) => {

	if (authData.authMode === AUTH_MODE_JWT && authData.authPayload instanceof User) {
		const membership = await validateUserClientForWorkspace({
			user: authData.authPayload,
			workspaceId,
			environment,
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
			requiredPermissions
		});
		
		return ({ membership });
	}
	
	throw UnauthorizedRequestError({
		message: 'Failed client authorization for workspace resource'
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
			organization: organizationId
		}).save();
		
		const bot = await createBot({
			name: 'Infisical Bot',
			workspaceId: workspace._id.toString()
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
