import * as Sentry from '@sentry/node';
import { Request, Response, NextFunction } from 'express';
import { IOrganization, MembershipOrg } from '../models';
import { UnauthorizedRequestError } from '../utils/errors';

/**
 * Validate if user on request is a member with proper roles for organization
 * on request params.
 * @param {Object} obj
 * @param {String[]} obj.acceptedRoles - accepted organization roles
 * @param {String[]} obj.acceptedStatuses - accepted organization statuses
 */
const requireOrganizationAuth = ({
	acceptedRoles,
	acceptedStatuses
}: {
	acceptedRoles: string[];
	acceptedStatuses: string[];
}) => {
	return async (req: Request, res: Response, next: NextFunction) => {
		// organization authorization middleware

		// validate organization membership
		const membershipOrg = await MembershipOrg.findOne({
			user: req.user._id,
			organization: req.params.organizationId
		}).populate<{ organization: IOrganization }>('organization');

		if (!membershipOrg) {
			return next(UnauthorizedRequestError({message: 'Failed to locate Organization Membership'}))
		}

		if (!acceptedRoles.includes(membershipOrg.role)) {
			return next(UnauthorizedRequestError({message: 'Failed to validate Organization Membership Role'}))
		}

		if (!acceptedStatuses.includes(membershipOrg.status)) {
			return next(UnauthorizedRequestError({message: 'Failed to validate Organization Membership Status'}))
		}

		req.membershipOrg = membershipOrg;

		return next();
	};
};

export default requireOrganizationAuth;
