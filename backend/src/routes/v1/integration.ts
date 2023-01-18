import express from 'express';
const router = express.Router();
import {
	requireAuth,
	requireIntegrationAuth,
	validateRequest
} from '../../middleware';
import { ADMIN, MEMBER } from '../../variables';
import { body, param } from 'express-validator';
import { integrationController } from '../../controllers/v1';

router.patch(
	'/:integrationId',
	requireAuth({
        acceptedAuthModes: ['jwt']
    }),
	requireIntegrationAuth({
		acceptedRoles: [ADMIN, MEMBER]
	}),
	param('integrationId').exists().trim(),
	body('app').exists().trim(),
	body('environment').exists().trim(),
	body('isActive').exists().isBoolean(),
	body('target').exists(),
	body('context').exists(),
	body('siteId').exists(),
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
