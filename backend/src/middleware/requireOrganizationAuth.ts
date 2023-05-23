import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { IOrganization, MembershipOrg } from '../models';
import { UnauthorizedRequestError, ValidationError } from '../utils/errors';
import { validateMembershipOrg } from '../helpers/membershipOrg';

type req = 'params' | 'body' | 'query';

/**
 * Validate if user on request is a member with proper roles for organization
 * on request params.
 * @param {Object} obj
 * @param {String[]} obj.acceptedRoles - accepted organization roles
 * @param {String[]} obj.accepteStatuses - accepted organization statuses
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
		const { organizationId } = req[location];
		req.membershipOrg = await validateMembershipOrg({
			userId: req.user._id,
			organizationId: new Types.ObjectId(organizationId),
			acceptedRoles,
			acceptedStatuses
		});

		return next();
	};
};

export default requireOrganizationAuth;
