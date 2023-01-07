import express from 'express';
const router = express.Router();
import { body, param, query } from 'express-validator';
import {
	requireAuth,
	requireWorkspaceAuth,
	validateRequest
} from '../../middleware';
import { ADMIN, MEMBER } from '../../variables';
import { workspaceController } from '../../controllers/v2';

router.post(
	'/:workspaceId/secrets',
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
	workspaceController.pushWorkspaceSecrets
);

router.get(
	'/:workspaceId/secrets',
	requireAuth({
		acceptedAuthModes: ['jwt', 'serviceToken']
	}),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER]
	}),
	query('environment').exists().trim(),
	query('channel'),
	param('workspaceId').exists().trim(),
	validateRequest,
	workspaceController.pullSecrets
);

router.get(
	'/:workspaceId/encrypted-key',
	requireAuth({
		acceptedAuthModes: ['jwt']
	}),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER]
	}),
	param('workspaceId').exists().trim(),
	validateRequest,
	workspaceController.getWorkspaceKey
);

router.get(
	'/:workspaceId/service-token-data',
	requireAuth({
		acceptedAuthModes: ['jwt']
	}),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER]
	}),
	param('workspaceId').exists().trim(),
	validateRequest,
	workspaceController.getWorkspaceServiceTokenData
);

export default router;
