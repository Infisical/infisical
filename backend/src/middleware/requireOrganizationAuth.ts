import * as Sentry from '@sentry/node';
import { Request, Response, NextFunction } from 'express';
import { IOrganization, MembershipOrg } from '../models';

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

		try {
			// validate organization membership
			const membershipOrg = await MembershipOrg.findOne({
				user: req.user._id,
				organization: req.params.organizationId
			}).populate<{ organization: IOrganization }>('organization');

			if (!membershipOrg) {
				throw new Error('Failed to find organization membership');
			}

			if (!acceptedRoles.includes(membershipOrg.role)) {
				throw new Error('Failed to validate organization membership role');
			}

			if (!acceptedStatuses.includes(membershipOrg.status)) {
				throw new Error('Failed to validate organization membership status');
			}

			req.membershipOrg = membershipOrg;

			return next();
		} catch (err) {
			Sentry.setUser(null);
			Sentry.captureException(err);
			return res.status(401).send({
				error: 'Failed organization authorization'
			});
		}
	};
};

export default requireOrganizationAuth;
