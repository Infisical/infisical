import * as Sentry from '@sentry/node';
import { Request, Response, NextFunction } from 'express';
import { IntegrationAuth } from '../models';
import { getOAuthAccessToken } from '../helpers/integrationAuth';
import { validateMembership } from '../helpers/membership';

/**
 * Validate if user on request is a member of workspace with proper roles associated
 * with the integration authorization on request params.
 * @param {Object} obj
 * @param {String[]} obj.acceptedRoles - accepted workspace roles
 * @param {String[]} obj.acceptedStatuses - accepted workspace statuses
 * @param {Boolean} obj.attachRefresh - whether or not to decrypt and attach integration authorization refresh token onto request
 */
const requireIntegrationAuthorizationAuth = ({
	acceptedRoles,
	acceptedStatuses
}: {
	acceptedRoles: string[];
	acceptedStatuses: string[];
}) => {
	return async (req: Request, res: Response, next: NextFunction) => {
		try {
			const { integrationAuthId } = req.params;

			const integrationAuth = await IntegrationAuth.findOne({
				_id: integrationAuthId
			}).select(
				'+refreshCiphertext +refreshIV +refreshTag +accessCiphertext +accessIV +accessTag +accessExpiresAt'
			);

			if (!integrationAuth) {
				throw new Error('Failed to find integration authorization');
			}
			
			await validateMembership({
				userId: req.user._id.toString(),
				workspaceId: integrationAuth.workspace.toString(),
				acceptedRoles,
				acceptedStatuses
			});

			req.integrationAuth = integrationAuth;
			req.accessToken = await getOAuthAccessToken({ integrationAuth });
			return next();
		} catch (err) {
			Sentry.setUser(null);
			Sentry.captureException(err);
			return res.status(401).send({
				error: 'Failed (authorization) integration authorizationt'
			});
		}
	};
};

export default requireIntegrationAuthorizationAuth;
