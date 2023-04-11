import { Types } from 'mongoose';
import {
    ISecret,
    IServiceTokenData
} from '../models';
import { UnauthorizedRequestError } from '../utils/errors';

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
    validateServiceTokenDataClientForWorkspace,
    validateServiceTokenDataClientForSecrets
}