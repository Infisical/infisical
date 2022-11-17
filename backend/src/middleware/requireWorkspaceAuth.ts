import * as Sentry from '@sentry/node';
import { Request, Response, NextFunction } from 'express';
import { Membership, IWorkspace } from '../models';

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
			// validate workspace membership

			const membership = await Membership.findOne({
				user: req.user._id,
				workspace: req[location].workspaceId
			}).populate<{ workspace: IWorkspace }>('workspace');

			if (!membership) {
				throw new Error('Failed to find workspace membership');
			}

			if (!acceptedRoles.includes(membership.role)) {
				throw new Error('Failed to validate workspace membership role');
			}

			if (!acceptedStatuses.includes(membership.status)) {
				throw new Error('Failed to validate workspace membership status');
			}

			req.membership = membership;

			return next();
		} catch (err) {
			Sentry.setUser(null);
			Sentry.captureException(err);
			return res.status(401).send({
				error: 'Failed workspace authorization'
			});
		}
	};
};

export default requireWorkspaceAuth;
