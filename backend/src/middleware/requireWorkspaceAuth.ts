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
	locationEnvironment = undefined
}: {
	acceptedRoles: string[];
	locationWorkspaceId: req;
	locationEnvironment?: req | undefined;
}) => {
	return async (req: Request, res: Response, next: NextFunction) => {
		try {
			// TODO: throw errors if workspaceId or environemnt are not present

			const workspaceId = req[locationWorkspaceId]?.workspaceId;
			const environment = locationEnvironment ? req[locationEnvironment]?.environment : undefined;
			
			// validate clients
			const { membership } = await validateClientForWorkspace({
				userId: req.user?._id,
				serviceAccountId: req.serviceAccount?._id,
				serviceTokenDataId: req.serviceTokenData?._id,
				workspaceId: new Types.ObjectId(workspaceId),
				environment
			});
			
			if (membership) {
				req.membership = membership;
			}
			
			if (
				req.serviceTokenData 
				&& req.serviceTokenData.workspace.toString() !== workspaceId
				&& req.serviceTokenData.environment !== req.body.environment
			) {
				next(UnauthorizedRequestError({message: 'Unable to authenticate workspace'}))	
			}

			return next();
		} catch (err) {
			return next(UnauthorizedRequestError({message: 'Unable to authenticate workspace'}))
		}
	};
};

export default requireWorkspaceAuth;
