import { Request, Response, NextFunction } from 'express';
import { UnauthorizedRequestError, SecretNotFoundError } from '../utils/errors';
import { Secret } from '../models';
import {
    validateMembership
} from '../helpers/membership';

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
                userId: req.user._id.toString(),
                workspaceId: secret.workspace.toString(),
                acceptedRoles
            });
            
            req.secret = secret as any;

            next();
        } catch (err) {
            return next(UnauthorizedRequestError({ message: 'Unable to authenticate secret' }));
        }
    }
}

export default requireSecretAuth;