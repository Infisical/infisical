import { Request, Response, NextFunction } from 'express';
import { UnauthorizedRequestError } from '../utils/errors';
import {
    MembershipOrg
} from '../models';
import { validateMembership } from '../helpers/membershipOrg';


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
    location = 'params'
}: {
    acceptedRoles: string[];
    location?: req;
}) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { membershipId } = req[location];
            const membershipOrg = await MembershipOrg.findById(membershipId);
            
            if (!membershipOrg) throw new Error('Failed to find target organization membership');
            
            const targetMembership = await validateMembership({
                userId: req.user._id.toString(),
                organizationId: membershipOrg.organization.toString(),
                acceptedRoles
            });
            
            req.targetMembership = targetMembership;
            
            return next();
        } catch (err) {
            return next(UnauthorizedRequestError({
                message: 'Unable to validate organization membership'
            }));
        }
    }
}

export default requireMembershipOrgAuth;