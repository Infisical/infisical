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

router.patch(
	'/:integrationId',
	requireAuth,
	requireIntegrationAuth({
		acceptedRoles: [ADMIN, MEMBER],
		acceptedStatuses: [GRANTED]
	}),
	param('integrationId').exists().trim(),
	body('app').exists().trim(),
	body('environment').exists().trim(),
	body('isActive').exists().isBoolean(),
	body('target').exists(),
	body('context').exists(),
	body('siteId').exists(),
	validateRequest,
	integrationController.updateIntegration
);

router.delete(
	'/:integrationId',
	requireAuth,
	requireIntegrationAuth({
		acceptedRoles: [ADMIN, MEMBER],
		acceptedStatuses: [GRANTED]
	}),
	param('integrationId').exists().trim(),
	validateRequest,
	integrationController.deleteIntegration
);

export default router;
