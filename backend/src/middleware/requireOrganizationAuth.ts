import { NextFunction, Request, Response } from "express";
import { Types } from "mongoose";
import { validateClientForOrganization } from "../validation";

type req = "params" | "body" | "query";

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
	locationOrganizationId = "params",
}: {
	acceptedRoles: Array<"owner" | "admin" | "member">;
	acceptedStatuses: Array<"invited" | "accepted">;
	locationOrganizationId?: req;
}) => {
	return async (req: Request, res: Response, next: NextFunction) => {
		const { organizationId } = req[locationOrganizationId];
		
		const { organization, membershipOrg } = await validateClientForOrganization({
			authData: req.authData,
			organizationId: new Types.ObjectId(organizationId),
			acceptedRoles,
			acceptedStatuses,
		});
		
		if (organization) {
			req.organization = organization;
		}

		if (membershipOrg) {
			req.membershipOrg = membershipOrg;
		}

		return next();
	};
};

export default requireOrganizationAuth;
