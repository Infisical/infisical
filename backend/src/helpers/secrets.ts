import { Types } from 'mongoose';
import {
    User,
    IUser,
    ServiceAccount,
    IServiceAccount,
    ServiceTokenData,
    IServiceTokenData,
    Secret,
    ISecret
} from '../models';
import {
    validateUserClientForSecrets
} from '../helpers/user';
import {
    validateServiceTokenDataClientForSecrets
} from '../helpers/serviceTokenData';
import {
    validateServiceAccountClientForSecrets
} from '../helpers/serviceAccount';
import { BadRequestError } from '../utils/errors';
import {
    AUTH_MODE_JWT,
    AUTH_MODE_SERVICE_ACCOUNT,
    AUTH_MODE_SERVICE_TOKEN,
    AUTH_MODE_API_KEY
} from '../variables';

/**
 * Validate accepted clients for secrets with ids [secretIds]
 * @param {Object} obj
 * @param {User} obj.user - user client
 * @param {ServiceAccount} obj.serviceAccount - service account client
 * @param {ServiceTokenData} obj.service - service token client
 * @param {String[]} obj.secretIds - ids of secrets to validate against
 */
const validateClientForSecrets = async ({
    authData,
    secretIds,
    requiredPermissions
}: {
    authData: {
		authMode: string;
		authPayload: IUser | IServiceAccount | IServiceTokenData;
	},
    secretIds: string[];
    requiredPermissions: string[];
}) => {

    let secrets: ISecret[] = [];
    
    secrets = await Secret.find({
        _id: {
            $in: secretIds.map((secretId: string) => new Types.ObjectId(secretId))
        }
    });

    if (secrets.length != secretIds.length) {
        throw BadRequestError({ message: 'Failed to validate non-existent secrets' })
    }

    if (authData.authMode === AUTH_MODE_JWT && authData.authPayload instanceof User) {
        // TODO
        await validateUserClientForSecrets({
            user: authData.authPayload,
            secrets,
            requiredPermissions
        });
    }
    
    if (authData.authMode === AUTH_MODE_SERVICE_ACCOUNT && authData.authPayload instanceof ServiceAccount) {
        // TODO
        await validateServiceAccountClientForSecrets({
            serviceAccount: authData.authPayload,
            secrets,
            requiredPermissions
        });
    }
        
    if (authData.authMode === AUTH_MODE_SERVICE_TOKEN && authData.authPayload instanceof ServiceTokenData) {
        await validateServiceTokenDataClientForSecrets({
            serviceTokenData: authData.authPayload,
            secrets,
            requiredPermissions
        });
    }

    if (authData.authMode === AUTH_MODE_API_KEY && authData.authPayload instanceof User) {
        // TODO
        await validateUserClientForSecrets({
            user: authData.authPayload,
            secrets,
            requiredPermissions
        });
    }
    
    return secrets;
}

export {
    validateClientForSecrets
}