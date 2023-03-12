import { Request, Response, NextFunction } from 'express';
import { validateMembership } from '../helpers/membership';
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
	location = 'params'
}: {
	acceptedRoles: string[];
	location?: req;
}) => {
	return async (req: Request, res: Response, next: NextFunction) => {
		try {
			const { workspaceId } = req[location];
			
			if (req.user) {
				// case: jwt auth
				const membership = await validateMembership({
					userId: req.user._id.toString(),
					workspaceId,
					acceptedRoles
				});

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
