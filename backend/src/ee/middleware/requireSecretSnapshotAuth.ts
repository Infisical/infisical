import { Request, Response, NextFunction } from 'express';
import { UnauthorizedRequestError, SecretSnapshotNotFoundError } from '../../utils/errors';
import { SecretSnapshot } from '../models';
import {
    validateMembership
} from '../../helpers/membership';

/**
 * Validate if user on request has proper membership for secret snapshot
 * @param {Object} obj
 * @param {String[]} obj.acceptedRoles - accepted workspace roles
 * @param {String[]} obj.acceptedStatuses - accepted workspace statuses
 * @param {String[]} obj.location - location of [workspaceId] on request (e.g. params, body) for parsing
 */
const requireSecretSnapshotAuth = ({
    acceptedRoles,
}: {
    acceptedRoles: Array<'admin' | 'member'>;
}) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        const { secretSnapshotId } = req.params;
        
        const secretSnapshot = await SecretSnapshot.findById(secretSnapshotId);
        
        if (!secretSnapshot) {
            return next(SecretSnapshotNotFoundError({
                message: 'Failed to find secret snapshot'
            }));
        }
        
        await validateMembership({
            userId: req.user._id,
            workspaceId: secretSnapshot.workspace,
            acceptedRoles
        });
        
        req.secretSnapshot = secretSnapshot as any;

        next();
    }
}

export default requireSecretSnapshotAuth;