import express from 'express';
const router = express.Router();
import {
	requireAuth,
	requireWorkspaceAuth,
	requireServiceTokenAuth,
	validateRequest
} from '../../middleware';
import { body, query, param } from 'express-validator';
import { secretController } from '../../controllers/v1';
import { ADMIN, MEMBER } from '../../variables';

router.post(
	'/:workspaceId',
	requireAuth({
		acceptedAuthModes: ['jwt']
	}),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER]
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
	requireAuth({
		acceptedAuthModes: ['jwt']
	}),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER]
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
