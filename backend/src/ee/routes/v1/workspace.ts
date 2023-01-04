import express from 'express';
const router = express.Router();
import {
	requireAuth,
	requireWorkspaceAuth,
	validateRequest
} from '../../../middleware';
import { param, query } from 'express-validator';
import { ADMIN, MEMBER, GRANTED } from '../../../variables';
import { workspaceController } from '../../controllers/v1';

router.get(
	'/:workspaceId/secret-snapshots',
	requireAuth({
		acceptedAuthModes: ['jwt']
	}),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER],
		acceptedStatuses: [GRANTED]
	}),
	param('workspaceId').exists().trim(),
	query('offset').exists().isInt(),
	query('limit').exists().isInt(),
	validateRequest,
	workspaceController.getWorkspaceSecretSnapshots
);

router.get(
	'/:workspaceId/secret-snapshots/count',
	requireAuth({
		acceptedAuthModes: ['jwt']
	}),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER],
		acceptedStatuses: [GRANTED]
	}),
	param('workspaceId').exists().trim(),
	validateRequest,
	workspaceController.getWorkspaceSecretSnapshotsCount
);

router.get(
	'/:workspaceId/logs',
	requireAuth,
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER],
		acceptedStatuses: [GRANTED]
	}),
	param('workspaceId').exists().trim(),
	query('offset').exists().isInt(),
	query('limit').exists().isInt(),
	query('sortBy'),
	query('userId'),
	query('actionNames'),
	validateRequest,
	workspaceController.getWorkspaceLogs
);

export default router;