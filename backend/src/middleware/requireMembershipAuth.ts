import { Request, Response, NextFunction } from 'express';
import { UnauthorizedRequestError } from '../utils/errors';
import {
    Membership,
} from '../models';
import { validateMembership } from '../helpers/membership';

type req = 'params' | 'body' | 'query';
/**
 * Validate membership with id [membershipId] and that user with id
 * [req.user._id] can modify that membership.
 * @param {Object} obj
 * @param {String[]} obj.acceptedRoles - accepted workspace roles for JWT auth
 * @param {String[]} obj.location - location of [workspaceId] on request (e.g. params, body) for parsing
 */
const requireMembershipAuth = ({
    acceptedRoles,
    location = 'params'
}: {
    acceptedRoles: string[];
    location?: req;
}) => {
    return async (
        req: Request, 
        res: Response, 
        next: NextFunction
    ) => {
        try {
            const { membershipId } = req[location];
            
            const membership = await Membership.findById(membershipId);
            
            if (!membership) throw new Error('Failed to find target membership');
            
            const userMembership = await Membership.findOne({
                workspace: membership.workspace
            });
            
            if (!userMembership) throw new Error('Failed to validate own membership')
            
            const targetMembership = await validateMembership({
                userId: req.user._id.toString(),
                workspaceId: membership.workspace.toString(),
                acceptedRoles
            });
            
            req.targetMembership = targetMembership;

        } catch (err) {
            return next(UnauthorizedRequestError({ 
                message: 'Unable to validate workspace membership' 
            }));
        }
    }
}

export default requireMembershipAuth;