import { Request, Response, NextFunction } from 'express';
import { Integration, IntegrationAuth } from '../models';
import { IntegrationService } from '../services';
import { validateMembership } from '../helpers/membership';
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
	acceptedRoles: string[];
}) => {
	return async (req: Request, res: Response, next: NextFunction) => {
		// integration authorization middleware

		const { integrationId } = req.params;

		// validate integration accessibility
		const integration = await Integration.findOne({
			_id: integrationId
		});

		if (!integration) {
			return next(IntegrationNotFoundError({message: 'Failed to locate Integration'}))
		}
		
		await validateMembership({
			userId: req.user._id.toString(),
			workspaceId: integration.workspace.toString(),
			acceptedRoles
		});

		const integrationAuth = await IntegrationAuth.findOne({
			_id: integration.integrationAuth
		}).select(
			'+refreshCiphertext +refreshIV +refreshTag +accessCiphertext +accessIV +accessTag +accessExpiresAt'
		);

		if (!integrationAuth) {
			return next(UnauthorizedRequestError({message: 'Failed to locate Integration Authentication credentials'}))
		}

		req.integration = integration;
		req.accessToken = await IntegrationService.getIntegrationAuthAccess({
			integrationAuthId: integrationAuth._id.toString()
		});

		return next();
	};
};

export default requireIntegrationAuth;
