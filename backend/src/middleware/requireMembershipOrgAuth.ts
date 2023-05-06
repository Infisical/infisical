import { Types } from 'mongoose';
import { Request, Response, NextFunction } from 'express';
import { validateClientForMembershipOrg } from '../validation';

type req = 'params' | 'body' | 'query';

/**
 * Validate (organization) membership id [membershipId] and that user with id 
 * [req.user._id] can modify that membership.
 * @param {Object} obj
 * @param {String[]} obj.acceptedRoles - accepted organization roles
 * @param {String[]} obj.location - location of [membershipId] on request (e.g. params, body) for parsing
 */
const requireMembershipOrgAuth = ({
    acceptedRoles,
    acceptedStatuses,
    locationMembershipOrgId = 'params'
}: {
    acceptedRoles: Array<'owner' | 'admin' | 'member'>;
	acceptedStatuses: Array<'invited' | 'accepted'>;
    locationMembershipOrgId?: req;
}) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        const { membershipId } = req[locationMembershipOrgId];
        
        req.membershipOrg = await validateClientForMembershipOrg({
            authData: req.authData,
            membershipOrgId: new Types.ObjectId(membershipId),
            acceptedRoles,
            acceptedStatuses
        });
        
        return next();
    }
}

export default requireMembershipOrgAuth;