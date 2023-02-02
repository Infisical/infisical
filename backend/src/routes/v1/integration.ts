import express from 'express';
const router = express.Router();
import {
	requireAuth,
	requireIntegrationAuth,
	requireIntegrationAuthorizationAuth,
	validateRequest
} from '../../middleware';
import { ADMIN, MEMBER } from '../../variables';
import { body, param } from 'express-validator';
import { integrationController } from '../../controllers/v1';

router.post( // new: add new integration
	'/',
	requireAuth({
        acceptedAuthModes: ['jwt', 'apiKey']
    }),
	requireIntegrationAuthorizationAuth({
		acceptedRoles: [ADMIN, MEMBER],
		location: 'body'
	}),
	body('integrationAuthId').exists().trim(),
	validateRequest,
	integrationController.createIntegration
);

router.patch(
	'/:integrationId',
	requireAuth({
        acceptedAuthModes: ['jwt']
    }),
	requireIntegrationAuth({
		acceptedRoles: [ADMIN, MEMBER]
	}),
	param('integrationId').exists().trim(),
	body('isActive').exists().isBoolean(),
	body('app').exists().trim(),
	body('environment').exists().trim(),
	body('appId').exists(),
	body('targetEnvironment').exists(),
	body('owner').exists(),
	validateRequest,
	integrationController.updateIntegration
);

router.delete(
	'/:integrationId',
	requireAuth({
        acceptedAuthModes: ['jwt']
    }),
	requireIntegrationAuth({
		acceptedRoles: [ADMIN, MEMBER]
	}),
	param('integrationId').exists().trim(),
	validateRequest,
	integrationController.deleteIntegration
);

export default router;
