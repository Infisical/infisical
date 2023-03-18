import { Request, Response, NextFunction } from 'express';
import { IOrganization, MembershipOrg } from '../models';
import { UnauthorizedRequestError, ValidationError } from '../utils/errors';

type req = 'params' | 'body' | 'query';

/**
 * Validate if user on request is a member with proper roles for organization
 * on request params.
 * @param {Object} obj
 * @param {String[]} obj.acceptedRoles - accepted organization roles
 * @param {String[]} obj.acceptedStatuses - accepted organization statuses
 */
const requireOrganizationAuth = ({
	acceptedRoles,
	acceptedStatuses,
	location = 'params'
}: {
	acceptedRoles: string[];
	acceptedStatuses: string[];
	location?: req;
}) => {
	return async (req: Request, res: Response, next: NextFunction) => {
		// organization authorization middleware
		
		const { organizationId } = req[location];

		// validate organization membership
		const membershipOrg = await MembershipOrg.findOne({
			user: req.user._id,
			organization: organizationId
		}).populate<{ organization: IOrganization }>('organization');


		if (!membershipOrg) {
			return next(UnauthorizedRequestError({message: "You're not a member of this Organization."}))
		}
		//TODO is this important to validate? I mean is it possible to save wrong role to database or get wrong role from databse? - Zamion101
		if (!acceptedRoles.includes(membershipOrg.role)) {
			return next(ValidationError({message: 'Failed to validate Organization Membership Role'}))
		}

		if (!acceptedStatuses.includes(membershipOrg.status)) {
			return next(ValidationError({message: 'Failed to validate Organization Membership Status'}))
		}

		req.membershipOrg = membershipOrg;

		return next();
	};
};

export default requireOrganizationAuth;
