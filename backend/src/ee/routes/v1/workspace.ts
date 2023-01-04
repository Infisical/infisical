import express from 'express';
const router = express.Router();
import {
	requireAuth,
	requireWorkspaceAuth,
	validateRequest
} from '../../../middleware';
import { param, query } from 'express-validator';
import { ADMIN, MEMBER } from '../../../variables';
import { workspaceController } from '../../controllers/v1';

router.get(
	'/:workspaceId/secret-snapshots',
	requireAuth({
		acceptedAuthModes: ['jwt']
	}),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER]
	}),
	param('workspaceId').exists().trim(),
	query('offset').exists().isInt(),
	query('limit').exists().isInt(),
	validateRequest,
	workspaceController.getWorkspaceSecretSnapshots
);

export default router;