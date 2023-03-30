import * as Sentry from '@sentry/node';
import { Request, Response, NextFunction } from 'express';
import { IntegrationAuth, IWorkspace } from '../models';
import { IntegrationService } from '../services';
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
	acceptedRoles: string[];
	attachAccessToken?: boolean;
	location?: req;
}) => {
	return async (req: Request, res: Response, next: NextFunction) => {
		const { integrationAuthId } = req[location];
		const integrationAuth = await IntegrationAuth.findOne({
			_id: integrationAuthId
		})
		.populate<{ workspace: IWorkspace }>('workspace')
		.select(
			'+refreshCiphertext +refreshIV +refreshTag +accessCiphertext +accessIV +accessTag +accessExpiresAt'
		);

		if (!integrationAuth) {
			return next(UnauthorizedRequestError({message: 'Failed to locate Integration Authorization credentials'}))
		}
		
		await validateMembership({
			userId: req.user._id,
			workspaceId: integrationAuth.workspace._id,
			acceptedRoles
		});

		req.integrationAuth = integrationAuth;
		if (attachAccessToken) {
			const access = await IntegrationService.getIntegrationAuthAccess({
				integrationAuthId: integrationAuth._id.toString()
			});
			req.accessToken = access.accessToken;
		}
		
		return next();
	};
};

export default requireIntegrationAuthorizationAuth;
