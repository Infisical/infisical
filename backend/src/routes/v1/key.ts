import express from 'express';
const router = express.Router();
import {
	requireAuth,
	requireWorkspaceAuth,
	validateRequest
} from '../../middleware';
import { body, param } from 'express-validator';
import { ADMIN, MEMBER } from '../../variables';
import { keyController } from '../../controllers/v1';

router.post(
	'/:workspaceId',
	requireAuth({
        acceptedAuthModes: ['jwt']
    }),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER]
	}),
	param('workspaceId').exists().trim(),
	body('key').exists(),
	validateRequest,
	keyController.uploadKey
);

router.get(
	'/:workspaceId/latest',
	requireAuth({
        acceptedAuthModes: ['jwt']
    }),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER]
	}),
	param('workspaceId'),
	validateRequest,
	keyController.getLatestKey
);

export default router;
