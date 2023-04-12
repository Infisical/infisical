import { Types } from 'mongoose';
import {
    IntegrationAuth,
    IUser,
    User,
    IServiceAccount,
    ServiceAccount,
    IServiceTokenData,
    ServiceTokenData,
    IWorkspace
} from '../models';
import { 
    AUTH_MODE_JWT,
    AUTH_MODE_SERVICE_ACCOUNT,
    AUTH_MODE_SERVICE_TOKEN,
    AUTH_MODE_API_KEY
} from '../variables';
import {
    IntegrationAuthNotFoundError,
    UnauthorizedRequestError
} from '../utils/errors';
import { IntegrationService } from '../services';
import { validateUserClientForWorkspace } from '../helpers/user';
import { validateServiceAccountClientForWorkspace } from '../helpers/serviceAccount';

/**
 * Validate authenticated clients for integration authorization with id [integrationAuthId] based
 * on any known permissions.
 * @param {Object} obj
 * @param {Object} obj.authData - authenticated client details
 * @param {Types.ObjectId} obj.integrationAuthId - id of integration authorization to validate against
 * @param {Array<'admin' | 'member'>} obj.acceptedRoles - accepted workspace roles
 * @param {String[]} obj.requiredPermissions - required permissions as part of the endpoint
 */
 const validateClientForIntegrationAuth = async ({
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

    const integrationAuth = await IntegrationAuth
        .findById(integrationId)
        .populate<{ workspace: IWorkspace }>('workspace')
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
            workspaceId: integrationAuth.workspace._id,
            acceptedRoles
        });

        return ({ integrationAuth, accessToken });
    }
    
    if (authData.authMode === AUTH_MODE_SERVICE_ACCOUNT && authData.authPayload instanceof ServiceAccount) {
        await validateServiceAccountClientForWorkspace({
            serviceAccount: authData.authPayload,
            workspaceId: integrationAuth.workspace._id
        });

        return ({ integrationAuth, accessToken });
    }

    if (authData.authMode === AUTH_MODE_SERVICE_TOKEN && authData.authPayload instanceof ServiceTokenData) {
        throw UnauthorizedRequestError({
            message: 'Failed service token authorization for integration authorization'
        });
    }

    if (authData.authMode === AUTH_MODE_API_KEY && authData.authPayload instanceof User) {
        await validateUserClientForWorkspace({
            user: authData.authPayload,
            workspaceId: integrationAuth.workspace._id,
            acceptedRoles
        });

        return ({ integrationAuth, accessToken });
    }
    
    throw UnauthorizedRequestError({
        message: 'Failed client authorization for integration authorization'
    });
}

export {
    validateClientForIntegrationAuth
};