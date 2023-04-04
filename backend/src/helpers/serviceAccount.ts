import _ from 'lodash';
import { Types } from 'mongoose';
import {
    IServiceAccount,
	ISecret,
	ServiceAccountWorkspacePermission
} from '../models';

/**
 * Validate that serviceAccount (client) can access workspace
 * with id [workspaceId] and its environment [environment] with required permissions
 * [requiredPermissions]
 *  @param {Object} obj
 *  @param {Object} obj.
 */
 const validateServiceAccountClientForWorkspace = async ({
    serviceAccount,
	workspaceId,
	environment,
	requiredPermissions
}: {
    serviceAccount: IServiceAccount;
	workspaceId: Types.ObjectId;
	environment: string;
	requiredPermissions: string[];
}) => {
	// TODO
	return [];
}

/**
 * Validate that service account (client) can access secrets
 * with required permissions [requiredPermissions]
 * @param {Object} obj
 * @param {ServiceTokenData} obj.serviceAccount - service account client
 * @param {Secret[]} secrets - secrets to validate against
 * @param {string[]} requiredPermissions - required permissions as part of the endpoint
 */
 const validateServiceAccountClientForSecrets = async ({
	serviceAccount,
	secrets,
	requiredPermissions
}: {
	serviceAccount: IServiceAccount;
	secrets: ISecret[];
	requiredPermissions?: string[];
}) => {

	const permissions = await ServiceAccountWorkspacePermission.find({
		serviceAccount: serviceAccount._id 
	});
	const permissionsObj = _.keyBy(permissions, (p) => {
		return `${p.workspace.toString()}-${p.environment}`
	});

	// TODO
    return [];
}

export {
    validateServiceAccountClientForWorkspace,
	validateServiceAccountClientForSecrets
}