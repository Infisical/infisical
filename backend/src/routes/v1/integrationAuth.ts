import express from 'express';
const router = express.Router();
import { body, param, query } from 'express-validator';
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

router.get(
	'/:integrationAuthId',
	requireAuth({
        acceptedAuthModes: ['jwt']
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

router.post(
	'/access-token',
	requireAuth({
        acceptedAuthModes: ['jwt', 'apiKey']
    }),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER],
		location: 'body'
	}),
	body('workspaceId').exists().trim().notEmpty(),
	body('accessId').trim(),
	body('accessToken').exists().trim().notEmpty(),
	body('integration').exists().trim().notEmpty(),
	validateRequest,
	integrationAuthController.saveIntegrationAccessToken
);

// this can optionally accept a teamId?
// IF teamId is passed in then it probably means that we want to get
// the apps for that team
router.get(
	'/:integrationAuthId/apps',
	requireAuth({
        acceptedAuthModes: ['jwt']
    }),
	requireIntegrationAuthorizationAuth({
		acceptedRoles: [ADMIN, MEMBER]
	}),
	param('integrationAuthId'),
	query('entity'),
	validateRequest,
	integrationAuthController.getIntegrationAuthApps
);

router.get(
	'/:integrationAuthId/teams',
	requireAuth({
        acceptedAuthModes: ['jwt']
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
