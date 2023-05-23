import { Request, Response, NextFunction } from 'express';
import { UnauthorizedRequestError, SecretNotFoundError } from '../utils/errors';
import { Secret } from '../models';
import {
    validateMembership
} from '../helpers/membership';

// note: used for old /v1/secret and /v2/secret routes.
// newer /v2/secrets routes use [requireSecretsAuth] middleware

/**
 * Validate if user on request has proper membership to modify secret.
 * @param {Object} obj
 * @param {String[]} obj.acceptedRoles - accepted workspace roles
 * @param {String[]} obj.location - location of [workspaceId] on request (e.g. params, body) for parsing
 */
const requireSecretAuth = ({
    acceptedRoles
}: {
    acceptedRoles: string[];
}) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { secretId } = req.params;
            
            const secret = await Secret.findById(secretId);
            
            if (!secret) {
                return next(SecretNotFoundError({
                    message: 'Failed to find secret'
                }));
            }
            
            await validateMembership({
                userId: req.user._id,
                workspaceId: secret.workspace,
                acceptedRoles
            });
            
            req._secret = secret;

            next();
        } catch (err) {
            return next(UnauthorizedRequestError({ message: 'Unable to authenticate secret' }));
        }
    }
}

export default requireSecretAuth;