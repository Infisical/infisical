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
import {
	ADMIN, 
	MEMBER,
	AUTH_MODE_JWT
} from '../../variables';

// note to devs: these endpoints will be deprecated in favor of v2

router.post(
	'/:workspaceId',
	requireAuth({
		acceptedAuthModes: [AUTH_MODE_JWT]
	}),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER],
		locationWorkspaceId: 'params'
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
		acceptedAuthModes: [AUTH_MODE_JWT]
	}),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER],
		locationWorkspaceId: 'params'
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
