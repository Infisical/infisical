import { Request, Response, NextFunction } from 'express';
import { validateMembership } from '../helpers/membership';
import { UnauthorizedRequestError } from '../utils/errors';

type req = 'params' | 'body' | 'query';

/**
 * Validate if user on request is a member with proper roles for workspace
 * on request params.
 * @param {Object} obj
 * @param {String[]} obj.acceptedRoles - accepted workspace roles
 * @param {String[]} obj.acceptedStatuses - accepted workspace statuses
 * @param {String[]} obj.location - location of [workspaceId] on request (e.g. params, body) for parsing
 */
const requireWorkspaceAuth = ({
	acceptedRoles,
	acceptedStatuses,
	location = 'params'
}: {
	acceptedRoles: string[];
	acceptedStatuses: string[];
	location?: req;
}) => {
	return async (req: Request, res: Response, next: NextFunction) => {
		// workspace authorization middleware

		try {
			const membership = await validateMembership({
				userId: req.user._id.toString(),
				workspaceId: req[location].workspaceId,
				acceptedRoles,
				acceptedStatuses
			});

			req.membership = membership;

			return next();
		} catch (err) {
			return next(UnauthorizedRequestError({message: 'Unable to authenticate workspace'}))
		}
	};
};

export default requireWorkspaceAuth;
