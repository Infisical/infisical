import express from 'express';
const router = express.Router();
import {
	requireAuth,
	requireWorkspaceAuth,
	validateRequest
} from '../../middleware';
import { body, param } from 'express-validator';
import { ADMIN, MEMBER, COMPLETED, GRANTED } from '../../variables';
import { keyController } from '../../controllers/v1';

router.post(
	'/:workspaceId',
	requireAuth,
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER],
		acceptedStatuses: [COMPLETED, GRANTED]
	}),
	param('workspaceId').exists().trim(),
	body('key').exists(),
	validateRequest,
	keyController.uploadKey
);

router.get(
	'/:workspaceId/latest',
	requireAuth,
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER],
		acceptedStatuses: [COMPLETED, GRANTED]
	}),
	param('workspaceId'),
	validateRequest,
	keyController.getLatestKey
);

export default router;
