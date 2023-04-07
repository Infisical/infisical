import express from 'express';
const router = express.Router();
import { body, param, query } from 'express-validator';
import {
	requireAuth,
	requireWorkspaceAuth,
	requireIntegrationAuthorizationAuth,
	validateRequest
} from '../../middleware';
import {
	ADMIN, 
	MEMBER,
	AUTH_MODE_JWT,
	AUTH_MODE_API_KEY
} from '../../variables';
import { integrationAuthController } from '../../controllers/v1';

router.get(
	'/integration-options',
	requireAuth({
        acceptedAuthModes: [AUTH_MODE_JWT]
    }),
	integrationAuthController.getIntegrationOptions
);

router.get(
	'/:integrationAuthId',
	requireAuth({
        acceptedAuthModes: [AUTH_MODE_JWT]
    }),
	requireIntegrationAuthorizationAuth({
		acceptedRoles: [ADMIN, MEMBER]
	}),
	param('integrationAuthId'),
	validateRequest,
	integrationAuthController.getIntegrationAuth	
);

router.post(
	'/oauth-token',
	requireAuth({
        acceptedAuthModes: [AUTH_MODE_JWT]
    }),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER],
		locationWorkspaceId: 'body'
	}),
	body('workspaceId').exists().trim().notEmpty(),
	body('code').exists().trim().notEmpty(),
	body('integration').exists().trim().notEmpty(),
	validateRequest,
	integrationAuthController.oAuthExchange
);

router.post(
	'/access-token',
	body('workspaceId').exists().trim().notEmpty(),
	body('accessId').trim(),
	body('accessToken').exists().trim().notEmpty(),
	body('integration').exists().trim().notEmpty(),
	validateRequest,
	requireAuth({
        acceptedAuthModes: [AUTH_MODE_JWT, AUTH_MODE_API_KEY]
    }),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER],
		locationWorkspaceId: 'body'
	}),
	integrationAuthController.saveIntegrationAccessToken
);

router.get(
	'/:integrationAuthId/apps',
	requireAuth({
        acceptedAuthModes: [AUTH_MODE_JWT]
    }),
	requireIntegrationAuthorizationAuth({
		acceptedRoles: [ADMIN, MEMBER]
	}),
	param('integrationAuthId'),
	query('teamId'),
	validateRequest,
	integrationAuthController.getIntegrationAuthApps
);

router.get(
	'/:integrationAuthId/teams',
	requireAuth({
        acceptedAuthModes: [AUTH_MODE_JWT]
    }),
	requireIntegrationAuthorizationAuth({
		acceptedRoles: [ADMIN, MEMBER]
	}),
	param('integrationAuthId'),
	validateRequest,
	integrationAuthController.getIntegrationAuthTeams
);

router.delete(
	'/:integrationAuthId',
	requireAuth({
        acceptedAuthModes: [AUTH_MODE_JWT]
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
