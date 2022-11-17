import express from 'express';
const router = express.Router();
import {
	requireAuth,
	requireIntegrationAuth,
	validateRequest
} from '../middleware';
import { ADMIN, MEMBER, GRANTED } from '../variables';
import { body, param } from 'express-validator';
import { integrationController } from '../controllers';

router.get('/integrations', requireAuth, integrationController.getIntegrations);

router.post(
	'/:integrationId/sync',
	requireAuth,
	requireIntegrationAuth({
		acceptedRoles: [ADMIN, MEMBER],
		acceptedStatuses: [GRANTED]
	}),
	param('integrationId').exists().trim(),
	body('key').exists(),
	body('secrets').exists(),
	validateRequest,
	integrationController.syncIntegration
);

router.patch(
	'/:integrationId',
	requireAuth,
	requireIntegrationAuth({
		acceptedRoles: [ADMIN, MEMBER],
		acceptedStatuses: [GRANTED]
	}),
	param('integrationId'),
	body('update'),
	validateRequest,
	integrationController.modifyIntegration
);

router.delete(
	'/:integrationId',
	requireAuth,
	requireIntegrationAuth({
		acceptedRoles: [ADMIN, MEMBER],
		acceptedStatuses: [GRANTED]
	}),
	param('integrationId'),
	validateRequest,
	integrationController.deleteIntegration
);

export default router;
