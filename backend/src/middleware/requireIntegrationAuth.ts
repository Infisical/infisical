import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { validateClientForIntegration } from '../validation';

/**
 * Validate if user on request is a member of workspace with proper roles associated
 * with the integration on request params.
 * @param {Object} obj
 * @param {String[]} obj.acceptedRoles - accepted workspace roles
 */
const requireIntegrationAuth = ({
	acceptedRoles
}: {
	acceptedRoles: Array<'admin' | 'member'>;
}) => {
	return async (req: Request, res: Response, next: NextFunction) => {
		const { integrationId } = req.params;

		const { integration, accessToken } = await validateClientForIntegration({
			authData: req.authData,
			integrationId: new Types.ObjectId(integrationId),
			acceptedRoles
		});

		if (integration) {
			req.integration = integration;
		}
		
		if (accessToken) {
			req.accessToken = accessToken;
		}

		return next();
	};
};

export default requireIntegrationAuth;
