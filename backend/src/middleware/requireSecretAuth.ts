import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { UnauthorizedRequestError, SecretNotFoundError } from '../utils/errors';
import { Secret } from '../models';
import {
    validateMembership
} from '../helpers/membership';
import {
    validateClientForSecret
} from '../helpers/secrets';

// note: used for old /v1/secret and /v2/secret routes.
// newer /v2/secrets routes use [requireSecretsAuth] middleware with the exception
// of some /ee endpoints

/**
 * Validate if user on request has proper membership to modify secret.
 * @param {Object} obj
 * @param {String[]} obj.acceptedRoles - accepted workspace roles
 * @param {String[]} obj.location - location of [workspaceId] on request (e.g. params, body) for parsing
 */
const requireSecretAuth = ({
    acceptedRoles,
    requiredPermissions
}: {
    acceptedRoles: Array<'admin' | 'member'>;
    requiredPermissions: string[];
}) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        const { secretId } = req.params;
        
        const secret = await validateClientForSecret({
            authData: req.authData,
            secretId: new Types.ObjectId(secretId),
            acceptedRoles,
            requiredPermissions
        });
        
        req._secret = secret;

        next();
    }
}

export default requireSecretAuth;