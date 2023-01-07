import * as Sentry from '@sentry/node';
import { Request, Response, NextFunction } from 'express';
import { IntegrationAuth } from '../models';
import { IntegrationService } from '../services';
import { validateMembership } from '../helpers/membership';
import { UnauthorizedRequestError } from '../utils/errors';

/**
 * Validate if user on request is a member of workspace with proper roles associated
 * with the integration authorization on request params.
 * @param {Object} obj
 * @param {String[]} obj.acceptedRoles - accepted workspace roles
 * @param {Boolean} obj.attachAccessToken - whether or not to decrypt and attach integration authorization access token onto request
 */
const requireIntegrationAuthorizationAuth = ({
	acceptedRoles,
	attachAccessToken = true
}: {
	acceptedRoles: string[];
	attachAccessToken?: boolean;
}) => {
	return async (req: Request, res: Response, next: NextFunction) => {
		const { integrationAuthId } = req.params;

		const integrationAuth = await IntegrationAuth.findOne({
			_id: integrationAuthId
		}).select(
			'+refreshCiphertext +refreshIV +refreshTag +accessCiphertext +accessIV +accessTag +accessExpiresAt'
		);

		if (!integrationAuth) {
			return next(UnauthorizedRequestError({message: 'Failed to locate Integration Authorization credentials'}))
		}
		
		await validateMembership({
			userId: req.user._id.toString(),
			workspaceId: integrationAuth.workspace.toString(),
			acceptedRoles
		});

		req.integrationAuth = integrationAuth;
		if (attachAccessToken) {
			req.accessToken = await IntegrationService.getIntegrationAuthAccess({
				integrationAuthId: integrationAuth._id.toString()
			});
		}
		
		return next();
	};
};

export default requireIntegrationAuthorizationAuth;
