import * as Sentry from '@sentry/node';
import { Request, Response, NextFunction } from 'express';
import { Integration, IntegrationAuth, Membership } from '../models';
import { getOAuthAccessToken } from '../helpers/integrationAuth';

/**
 * Validate if user on request is a member of workspace with proper roles associated
 * with the integration on request params.
 * @param {Object} obj
 * @param {String[]} obj.acceptedRoles - accepted workspace roles
 * @param {String[]} obj.acceptedStatuses - accepted workspace statuses
 */
const requireIntegrationAuth = ({
	acceptedRoles,
	acceptedStatuses
}: {
	acceptedRoles: string[];
	acceptedStatuses: string[];
}) => {
	return async (req: Request, res: Response, next: NextFunction) => {
		// integration authorization middleware

		try {
			const { integrationId } = req.params;

			// validate integration accessibility
			const integration = await Integration.findOne({
				_id: integrationId
			});

			if (!integration) {
				throw new Error('Failed to find integration');
			}

			const membership = await Membership.findOne({
				user: req.user._id,
				workspace: integration.workspace
			});

			if (!membership) {
				throw new Error('Failed to find integration workspace membership');
			}

			if (!acceptedRoles.includes(membership.role)) {
				throw new Error('Failed to validate workspace membership role');
			}

			if (!acceptedStatuses.includes(membership.status)) {
				throw new Error('Failed to validate workspace membership status');
			}

			const integrationAuth = await IntegrationAuth.findOne({
				_id: integration.integrationAuth
			}).select(
				'+refreshCiphertext +refreshIV +refreshTag +accessCiphertext +accessIV +accessTag +accessExpiresAt'
			);

			if (!integrationAuth) {
				throw new Error('Failed to find integration authorization');
			}

			req.integration = integration;
			req.accessToken = await getOAuthAccessToken({ integrationAuth });

			return next();
		} catch (err) {
			Sentry.setUser(null);
			Sentry.captureException(err);
			return res.status(401).send({
				error: 'Failed integration authorization'
			});
		}
	};
};

export default requireIntegrationAuth;
