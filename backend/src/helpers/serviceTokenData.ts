import { Types } from 'mongoose';
import {
    ISecret,
    IServiceTokenData,
    ServiceTokenData,
    IUser,
    User,
    IServiceAccount,
    ServiceAccount,
} from '../models';
import { 
    UnauthorizedRequestError,
    ServiceTokenDataNotFoundError
} from '../utils/errors';
import {
    AUTH_MODE_JWT,
	AUTH_MODE_SERVICE_ACCOUNT,
	AUTH_MODE_SERVICE_TOKEN,
	AUTH_MODE_API_KEY
} from '../variables';
import { validateUserClientForWorkspace } from '../helpers/user';
import { validateServiceAccountClientForWorkspace } from '../helpers/serviceAccount';

/**
 * Validate authenticated clients for service token with id [serviceTokenId] based
 * on any known permissions.
 * @param {Object} obj
 * @param {Object} obj.authData - authenticated client details
 * @param {Types.ObjectId} obj.serviceTokenData - id of service token to validate against
 * @param {Array<'admin' | 'member'>} obj.acceptedRoles - accepted workspace roles
 */
const validateClientForServiceTokenData = async ({
    authData,
    serviceTokenDataId,
    acceptedRoles
}: {
    authData: {
		authMode: string;
		authPayload: IUser | IServiceAccount | IServiceTokenData;
	};
    serviceTokenDataId: Types.ObjectId;
    acceptedRoles: Array<'admin' | 'member'>;
}) => {
    const serviceTokenData = await ServiceTokenData
            .findById(serviceTokenDataId)
            .select('+encryptedKey +iv +tag')
            .populate<{ user: IUser }>('user');

    if (!serviceTokenData) throw ServiceTokenDataNotFoundError({
        message: 'Failed to find service token data'
    });

    if (authData.authMode === AUTH_MODE_JWT && authData.authPayload instanceof User) {
        await validateUserClientForWorkspace({
            user: authData.authPayload,
            workspaceId: serviceTokenData.workspace,
            acceptedRoles
        });
        
        return serviceTokenData;
    }

    if (authData.authMode === AUTH_MODE_SERVICE_ACCOUNT && authData.authPayload instanceof ServiceAccount) {
        await validateServiceAccountClientForWorkspace({
            serviceAccount: authData.authPayload,
            workspaceId: serviceTokenData.workspace
        });
        
        return serviceTokenData;
    }

    if (authData.authMode === AUTH_MODE_SERVICE_TOKEN && authData.authPayload instanceof ServiceTokenData) {
        throw UnauthorizedRequestError({
            message: 'Failed service token authorization for service token data'
        });
    }

    if (authData.authMode === AUTH_MODE_API_KEY && authData.authPayload instanceof User) {
        await validateUserClientForWorkspace({
            user: authData.authPayload,
            workspaceId: serviceTokenData.workspace,
            acceptedRoles
        });
        
        return serviceTokenData;
    }
    
    throw UnauthorizedRequestError({
        message: 'Failed client authorization for service token data'
    });
}

/**
 * Validate that service token (client) can access workspace
 * with id [workspaceId] and its environment [environment] with required permissions
 * [requiredPermissions]
 * @param {Object} obj
 * @param {ServiceTokenData} obj.serviceTokenData - service token client
 * @param {Types.ObjectId} obj.workspaceId - id of workspace to validate against
 * @param {String} environment - (optional) environment in workspace to validate against
 * @param {String[]} requiredPermissions - required permissions as part of the endpoint
 */
 const validateServiceTokenDataClientForWorkspace = async ({
    serviceTokenData,
	workspaceId,
	environment,
	requiredPermissions
}: {
    serviceTokenData: IServiceTokenData;
	workspaceId: Types.ObjectId;
	environment?: string;
	requiredPermissions?: string[];
}) => {

    if (!serviceTokenData.workspace.equals(workspaceId)) {
        // case: invalid workspaceId passed
        throw UnauthorizedRequestError({
            message: 'Failed service token authorization for the given workspace'
        });
    }

    if (environment) {
        // case: environment is specified
        
        if (serviceTokenData.environment !== environment) {
            // case: invalid environment passed
            throw UnauthorizedRequestError({
                message: 'Failed service token authorization for the given workspace environment'
            });
        }

        requiredPermissions?.forEach((permission) => {
            if (!serviceTokenData.permissions.includes(permission)) {
                throw UnauthorizedRequestError({
                    message: `Failed service token authorization for the given workspace environment action: ${permission}`
                });
            }
        });
    }
}

/**
 * Validate that service token (client) can access secrets
 * with required permissions [requiredPermissions]
 * @param {Object} obj
 * @param {ServiceTokenData} obj.serviceTokenData - service token client
 * @param {Secret[]} secrets - secrets to validate against
 * @param {string[]} requiredPermissions - required permissions as part of the endpoint
 */
 const validateServiceTokenDataClientForSecrets = async ({
    serviceTokenData,
    secrets,
	requiredPermissions
}: {
    serviceTokenData: IServiceTokenData;
    secrets: ISecret[];
	requiredPermissions?: string[];
}) => {

    secrets.forEach((secret: ISecret) => {
        if (!serviceTokenData.workspace.equals(secret.workspace)) {
            // case: invalid workspaceId passed
            throw UnauthorizedRequestError({
                message: 'Failed service token authorization for the given workspace'
            });
        }
        
        if (serviceTokenData.environment !== secret.environment) {
            // case: invalid environment passed
            throw UnauthorizedRequestError({
                message: 'Failed service token authorization for the given workspace environment'
            });
        }
        
        requiredPermissions?.forEach((permission) => {
            if (!serviceTokenData.permissions.includes(permission)) {
                throw UnauthorizedRequestError({
                    message: `Failed service token authorization for the given workspace environment action: ${permission}`
                });
            }
        });
    });
}

export {
    validateClientForServiceTokenData,
    validateServiceTokenDataClientForWorkspace,
    validateServiceTokenDataClientForSecrets
}