import express from 'express';
const router = express.Router();
import {
    requireAuth,
    requireWorkspaceAuth,
    validateRequest
} from '../../../middleware';
import { body, query, param } from 'express-validator';
import { secretController } from '../../controllers/v1';
import { ADMIN, MEMBER, COMPLETED, GRANTED } from '../../../variables';

router.get(
	'/:secretId/secret-versions',
	requireAuth({
		acceptedAuthModes: ['jwt']
	}),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER],
		acceptedStatuses: [COMPLETED, GRANTED]
	}),
	param('secretId').exists().trim(),
	query('offset').exists().isInt(),
	query('limit').exists().isInt(),
	validateRequest,
	secretController.getSecretVersions
);

export default router;