import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { Integration, IntegrationAuth } from '../models';
import { IntegrationService } from '../services';
import { validateMembership } from '../helpers/membership';
import { validateClientForIntegration } from '../helpers/integration';
import { IntegrationNotFoundError, UnauthorizedRequestError } from '../utils/errors';

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
		// integration authorization middleware

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
