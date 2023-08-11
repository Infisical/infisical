import _ from "lodash";
import { Types } from "mongoose";
import {
	IOrganization,
	ISecret,
	IServiceAccount,
	IUser,
	ServiceAccount,
	ServiceAccountWorkspacePermission,
} from "../models";
import { validateUserClientForServiceAccount } from "./user";
import { 
	BadRequestError, 
	ServiceAccountNotFoundError,
	UnauthorizedRequestError,
} from "../utils/errors";
import {
	PERMISSION_READ_SECRETS,
	PERMISSION_WRITE_SECRETS,
} from "../variables";
import { AuthData } from "../interfaces/middleware";
import { ActorType } from "../ee/models";

export const validateClientForServiceAccount = async ({
	authData,
	serviceAccountId,
	requiredPermissions,
}: {
	authData: AuthData;
	serviceAccountId: Types.ObjectId;
	requiredPermissions?: string[];
}) => {
	const serviceAccount = await ServiceAccount.findById(serviceAccountId); 
	
	if (!serviceAccount) {
		throw ServiceAccountNotFoundError({
			message: "Failed to find service account",
		});
	}
	
	switch (authData.actor.type) {
		case ActorType.USER:
			await validateUserClientForServiceAccount({
				user: authData.authPayload as IUser,
				serviceAccount,
				requiredPermissions,
			});
			
			return serviceAccount;
		case ActorType.SERVICE:
			throw UnauthorizedRequestError({
				message: "Failed service token authorization for service account resource",
			});
	}
}

/**
 * Validate that service account (client) can access workspace
 * with id [workspaceId] and its environment [environment] with required permissions
 * [requiredPermissions]
 * @param {Object} obj
 * @param {ServiceAccount} obj.serviceAccount - service account client
 * @param {Types.ObjectId} obj.workspaceId - id of workspace to validate against
 * @param {String} environment - (optional) environment in workspace to validate against
 * @param {String[]} requiredPermissions - required permissions as part of the endpoint
 */
export const validateServiceAccountClientForWorkspace = async ({
    serviceAccount,
	workspaceId,
	environment,
	requiredPermissions,
}: {
    serviceAccount: IServiceAccount;
	workspaceId: Types.ObjectId;
	environment?: string;
	requiredPermissions?: string[];
}) => {
	if (environment) {
		// case: environment specified ->
		// evaluate service account authorization for workspace
		// in the context of a specific environment [environment]
		const permission = await ServiceAccountWorkspacePermission.findOne({
			serviceAccount,
			workspace: new Types.ObjectId(workspaceId),
			environment,
		});
	
		if (!permission) throw UnauthorizedRequestError({
			message: "Failed service account authorization for the given workspace environment",
		});

		let runningIsDisallowed = false;
		requiredPermissions?.forEach((requiredPermission: string) => {
			switch (requiredPermission) {
				case PERMISSION_READ_SECRETS:
					if (!permission.read) runningIsDisallowed = true;
					break;
				case PERMISSION_WRITE_SECRETS:
					if (!permission.write) runningIsDisallowed = true;
					break;
				default:
					break;
			}
			
			if (runningIsDisallowed) {
				throw UnauthorizedRequestError({
					message: `Failed permissions authorization for workspace environment action : ${requiredPermission}`,
				});	
			}
		});
		
	} else {
		// case: no environment specified ->
		// evaluate service account authorization for workspace
		// without need of environment [environment]

		const permission = await ServiceAccountWorkspacePermission.findOne({
			serviceAccount,
			workspace: new Types.ObjectId(workspaceId),
		});
		
		if (!permission) throw UnauthorizedRequestError({
			message: "Failed service account authorization for the given workspace",
		});
	}
}

/**
 * Validate that service account (client) can access secrets
 * with required permissions [requiredPermissions]
 * @param {Object} obj
 * @param {ServiceAccount} obj.serviceAccount - service account client
 * @param {Secret[]} secrets - secrets to validate against
 * @param {string[]} requiredPermissions - required permissions as part of the endpoint
 */
export const validateServiceAccountClientForSecrets = async ({
	serviceAccount,
	secrets,
	requiredPermissions,
}: {
	serviceAccount: IServiceAccount;
	secrets: ISecret[];
	requiredPermissions?: string[];
}) => {

	const permissions = await ServiceAccountWorkspacePermission.find({
		serviceAccount: serviceAccount._id, 
	});

	const permissionsObj = _.keyBy(permissions, (p) => {
		return `${p.workspace.toString()}-${p.environment}`
	});

	secrets.forEach((secret: ISecret) => {
		const permission = permissionsObj[`${secret.workspace.toString()}-${secret.environment}`];
		
		if (!permission) throw BadRequestError({
			message: "Failed to find any permission for the secret workspace and environment",
		});
		
		requiredPermissions?.forEach((requiredPermission: string) => {
			let runningIsDisallowed = false;
			requiredPermissions?.forEach((requiredPermission: string) => {
				switch (requiredPermission) {
					case PERMISSION_READ_SECRETS:
						if (!permission.read) runningIsDisallowed = true;
						break;
					case PERMISSION_WRITE_SECRETS:
						if (!permission.write) runningIsDisallowed = true;
						break;
					default:
						break;
				}
				
				if (runningIsDisallowed) {
					throw UnauthorizedRequestError({
						message: `Failed permissions authorization for workspace environment action : ${requiredPermission}`,
					});	
				}
			});
		});
	});
}

/**
 * Validate that service account (client) can access target service
 * account [serviceAccount] with required permissions [requiredPermissions]
 * @param {Object} obj
 * @param {SerivceAccount} obj.serviceAccount - service account client
 * @param {ServiceAccount} targetServiceAccount - target service account to validate against
 * @param {string[]} requiredPermissions - required permissions as part of the endpoint
 */
export const validateServiceAccountClientForServiceAccount = ({
	serviceAccount,
	targetServiceAccount,
	requiredPermissions,
}: {
	serviceAccount: IServiceAccount;
	targetServiceAccount: IServiceAccount;
	requiredPermissions?: string[];
}) => {
	if (!serviceAccount.organization.equals(targetServiceAccount.organization)) {
		throw UnauthorizedRequestError({
			message: "Failed service account authorization for the given service account",
		});
	}
}

/**
 * Validate that service account (client) can access organization [organization]
 * @param {Object} obj
 * @param {User} obj.user - service account client
 * @param {Organization} obj.organization - organization to validate against
 */
export const validateServiceAccountClientForOrganization = async ({
	serviceAccount,
	organization,
}: {
	serviceAccount: IServiceAccount;
	organization: IOrganization;
}) => {
	if (!serviceAccount.organization.equals(organization._id)) {
		throw UnauthorizedRequestError({
			message: "Failed service account authorization for the given organization",
		});
	}
}