import { Types } from 'mongoose';
import {
    IUser,
    IServiceAccount,
    IServiceTokenData,
    Integration,
    IntegrationAuth,
    User,
    ServiceAccount,
    ServiceTokenData
} from '../models';
import { validateServiceAccountClientForWorkspace } from './serviceAccount';
import { validateUserClientForWorkspace } from './user';
import { IntegrationService } from '../services';
import {
    IntegrationNotFoundError,
    IntegrationAuthNotFoundError,
    UnauthorizedRequestError
} from '../utils/errors';
import {
    AUTH_MODE_JWT,
    AUTH_MODE_SERVICE_ACCOUNT,
    AUTH_MODE_SERVICE_TOKEN,
    AUTH_MODE_API_KEY
} from '../variables';

/**
 * Validate authenticated clients for integration with id [integrationId] based
 * on any known permissions.
 * @param {Object} obj
 * @param {Object} obj.authData - authenticated client details
 * @param {Types.ObjectId} obj.integrationId - id of integration to validate against
 * @param {String} obj.environment - (optional) environment in workspace to validate against
 * @param {Array<'admin' | 'member'>} obj.acceptedRoles - accepted workspace roles
 * @param {String[]} obj.requiredPermissions - required permissions as part of the endpoint
 */
export const validateClientForIntegration = async ({
    authData,
    integrationId,
    acceptedRoles
}: {
    authData: {
		authMode: string;
		authPayload: IUser | IServiceAccount | IServiceTokenData;
	};
    integrationId: Types.ObjectId;
    acceptedRoles: Array<'admin' | 'member'>;
}) => {
    
    const integration = await Integration.findById(integrationId);
    if (!integration) throw IntegrationNotFoundError();

    const integrationAuth = await IntegrationAuth
        .findById(integration.integrationAuth)
        .select(
			'+refreshCiphertext +refreshIV +refreshTag +accessCiphertext +accessIV +accessTag +accessExpiresAt'
        );
    
    if (!integrationAuth) throw IntegrationAuthNotFoundError();

    const accessToken = (await IntegrationService.getIntegrationAuthAccess({
        integrationAuthId: integrationAuth._id
    })).accessToken;

    if (authData.authMode === AUTH_MODE_JWT && authData.authPayload instanceof User) {
        await validateUserClientForWorkspace({
            user: authData.authPayload,
            workspaceId: integration.workspace,
            acceptedRoles
        });
        
        return ({ integration, accessToken });
    }
    
    if (authData.authMode === AUTH_MODE_SERVICE_ACCOUNT && authData.authPayload instanceof ServiceAccount) {
        await validateServiceAccountClientForWorkspace({
            serviceAccount: authData.authPayload,
            workspaceId: integration.workspace
        });
        
        return ({ integration, accessToken });
    }

    if (authData.authMode === AUTH_MODE_SERVICE_TOKEN && authData.authPayload instanceof ServiceTokenData) {
        throw UnauthorizedRequestError({
            message: 'Failed service token authorization for integration'
        });
    }

    if (authData.authMode === AUTH_MODE_API_KEY && authData.authPayload instanceof User) {
        await validateUserClientForWorkspace({
            user: authData.authPayload,
            workspaceId: integration.workspace,
            acceptedRoles
        });
        
        return ({ integration, accessToken });
    }
    
    throw UnauthorizedRequestError({
        message: 'Failed client authorization for integration'
    });
}