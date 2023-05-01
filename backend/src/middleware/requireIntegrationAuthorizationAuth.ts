import { Types } from 'mongoose';
import { Request, Response, NextFunction } from 'express';
import { IntegrationAuth, IWorkspace } from '../models';
import { IntegrationService } from '../services';
import { validateClientForIntegrationAuth } from '../helpers/integrationAuth';
import { validateMembership } from '../helpers/membership';
import { UnauthorizedRequestError } from '../utils/errors';

type req = 'params' | 'body' | 'query';

/**
 * Validate if user on request is a member of workspace with proper roles associated
 * with the integration authorization on request params.
 * @param {Object} obj
 * @param {String[]} obj.acceptedRoles - accepted workspace roles
 * @param {Boolean} obj.attachAccessToken - whether or not to decrypt and attach integration authorization access token onto request
 */
const requireIntegrationAuthorizationAuth = ({
	acceptedRoles,
	attachAccessToken = true,
	location = 'params'
}: {
	acceptedRoles: Array<'admin' | 'member'>;
	attachAccessToken?: boolean;
	location?: req;
}) => {
	return async (req: Request, res: Response, next: NextFunction) => {
		const { integrationAuthId } = req[location];

		const { integrationAuth, accessToken } = await validateClientForIntegrationAuth({
			authData: req.authData,
			integrationAuthId: new Types.ObjectId(integrationAuthId),
			acceptedRoles,
			attachAccessToken
		});
		
		if (integrationAuth) {
			req.integrationAuth = integrationAuth;
		}

		if (accessToken) {
			req.accessToken = accessToken;
		}
		
		return next();
	};
};

export default requireIntegrationAuthorizationAuth;
