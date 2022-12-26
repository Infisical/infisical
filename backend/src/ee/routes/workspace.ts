import express from 'express';
const router = express.Router();
import {
	requireAuth,
	requireWorkspaceAuth,
	validateRequest
} from '../../middleware';
import { param, query } from 'express-validator';
import { ADMIN, MEMBER, GRANTED } from '../../variables';
import { workspaceController } from '../controllers';

router.get(
	'/:workspaceId/secret-snapshots',
	requireAuth,
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


export default router;