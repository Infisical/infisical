import express from 'express';
const router = express.Router();
import { body, param } from 'express-validator';
import {
	requireAuth,
	requireWorkspaceAuth,
	requireIntegrationAuthorizationAuth,
	validateRequest
} from '../middleware';
import { ADMIN, MEMBER, GRANTED } from '../variables';
import { integrationAuthController } from '../controllers';

router.post(
	'/oauth-token',
	requireAuth,
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER],
		acceptedStatuses: [GRANTED],
		location: 'body'
	}),
	body('workspaceId').exists().trim().notEmpty(),
	body('code').exists().trim().notEmpty(),
	body('integration').exists().trim().notEmpty(),
	validateRequest,
	integrationAuthController.integrationAuthOauthExchange
);

router.get(
	'/:integrationAuthId/apps',
	requireAuth,
	requireIntegrationAuthorizationAuth({
		acceptedRoles: [ADMIN, MEMBER],
		acceptedStatuses: [GRANTED]
	}),
	param('integrationAuthId'),
	validateRequest,
	integrationAuthController.getIntegrationAuthApps
);

router.delete(
	'/:integrationAuthId',
	requireAuth,
	requireIntegrationAuthorizationAuth({
		acceptedRoles: [ADMIN, MEMBER],
		acceptedStatuses: [GRANTED]
	}),
	param('integrationAuthId'),
	validateRequest,
	integrationAuthController.deleteIntegrationAuth
);

export default router;
