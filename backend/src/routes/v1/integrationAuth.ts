import express from 'express';
const router = express.Router();
import { body, param } from 'express-validator';
import {
	requireAuth,
	requireWorkspaceAuth,
	requireIntegrationAuthorizationAuth,
	validateRequest
} from '../../middleware';
import { ADMIN, MEMBER } from '../../variables';
import { integrationAuthController } from '../../controllers/v1';

router.get(
	'/integration-options',
	requireAuth({
        acceptedAuthModes: ['jwt']
    }),
	integrationAuthController.getIntegrationOptions
);

router.post(
	'/oauth-token',
	requireAuth({
        acceptedAuthModes: ['jwt']
    }),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER],
		location: 'body'
	}),
	body('workspaceId').exists().trim().notEmpty(),
	body('code').exists().trim().notEmpty(),
	body('integration').exists().trim().notEmpty(),
	validateRequest,
	integrationAuthController.oAuthExchange
);

router.get(
	'/:integrationAuthId/apps',
	requireAuth({
        acceptedAuthModes: ['jwt']
    }),
	requireIntegrationAuthorizationAuth({
		acceptedRoles: [ADMIN, MEMBER]
	}),
	param('integrationAuthId'),
	validateRequest,
	integrationAuthController.getIntegrationAuthApps
);

router.delete(
	'/:integrationAuthId',
	requireAuth({
        acceptedAuthModes: ['jwt']
    }),
	requireIntegrationAuthorizationAuth({
		acceptedRoles: [ADMIN, MEMBER],
		attachAccessToken: false
	}),
	param('integrationAuthId'),
	validateRequest,
	integrationAuthController.deleteIntegrationAuth
);

export default router;
