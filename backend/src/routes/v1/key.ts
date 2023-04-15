import express from 'express';
const router = express.Router();
import {
	requireAuth,
	requireWorkspaceAuth,
	validateRequest
} from '../../middleware';
import { body, param } from 'express-validator';
import { ADMIN, MEMBER, AUTH_MODE_JWT } from '../../variables';
import { keyController } from '../../controllers/v1';

router.post(
	'/:workspaceId',
	requireAuth({
        acceptedAuthModes: [AUTH_MODE_JWT]
    }),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER],
		locationWorkspaceId: 'params'
	}),
	param('workspaceId').exists().trim(),
	body('key').exists(),
	validateRequest,
	keyController.uploadKey
);

router.get(
	'/:workspaceId/latest',
	requireAuth({
        acceptedAuthModes: [AUTH_MODE_JWT]
    }),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER],
		locationWorkspaceId: 'params'
	}),
	param('workspaceId'),
	validateRequest,
	keyController.getLatestKey
);

export default router;
