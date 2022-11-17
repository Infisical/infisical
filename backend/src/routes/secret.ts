import express from 'express';
const router = express.Router();
import {
	requireAuth,
	requireWorkspaceAuth,
	requireServiceTokenAuth,
	validateRequest
} from '../middleware';
import { body, query, param } from 'express-validator';
import { ADMIN, MEMBER, COMPLETED, GRANTED } from '../variables';
import { secretController } from '../controllers';

router.post(
	'/:workspaceId',
	requireAuth,
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER],
		acceptedStatuses: [COMPLETED, GRANTED]
	}),
	body('secrets').exists(),
	body('keys').exists(),
	body('environment').exists().trim().notEmpty(),
	body('channel'),
	param('workspaceId').exists().trim(),
	validateRequest,
	secretController.pushSecrets
);

router.get(
	'/:workspaceId',
	requireAuth,
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER],
		acceptedStatuses: [COMPLETED, GRANTED]
	}),
	query('environment').exists().trim(),
	query('channel'),
	param('workspaceId').exists().trim(),
	validateRequest,
	secretController.pullSecrets
);

router.get(
	'/:workspaceId/service-token',
	requireServiceTokenAuth,
	query('environment').exists().trim(),
	query('channel'),
	param('workspaceId').exists().trim(),
	validateRequest,
	secretController.pullSecretsServiceToken
);

export default router;
