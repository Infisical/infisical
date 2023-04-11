import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { validateMembership } from '../helpers/membership';
import { validateClientForWorkspace } from '../helpers/workspace';
import { UnauthorizedRequestError } from '../utils/errors';

type req = 'params' | 'body' | 'query';

/**
 * Validate if user on request is a member with proper roles for workspace
 * on request params.
 * @param {Object} obj
 * @param {String[]} obj.acceptedRoles - accepted workspace roles for JWT auth
 * @param {String[]} obj.location - location of [workspaceId] on request (e.g. params, body) for parsing
 */
const requireWorkspaceAuth = ({
	acceptedRoles,
	locationWorkspaceId,
	locationEnvironment = undefined,
	requiredPermissions = []
}: {
	acceptedRoles: Array<'admin' | 'member'>;
	locationWorkspaceId: req;
	locationEnvironment?: req | undefined;
	requiredPermissions?: string[];
}) => {
	return async (req: Request, res: Response, next: NextFunction) => {
		
		const workspaceId = req[locationWorkspaceId]?.workspaceId;
		const environment = locationEnvironment ? req[locationEnvironment]?.environment : undefined;
		
		// validate clients
		const { membership } = await validateClientForWorkspace({
			authData: req.authData,
			workspaceId: new Types.ObjectId(workspaceId),
			environment,
			acceptedRoles,
			requiredPermissions
		});
		
		if (membership) {
			req.membership = membership;
		}

		return next();
	};
};

export default requireWorkspaceAuth;
