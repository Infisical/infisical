import express from 'express';
const router = express.Router();
import { body, param } from 'express-validator';
import {
    requireAuth,
    requireBotAuth,
    requireWorkspaceAuth,
    validateRequest
} from '../../middleware';
import { botController } from '../../controllers/v1';
import { ADMIN, MEMBER, COMPLETED, GRANTED } from '../../variables';

router.get(
    '/:workspaceId',
	requireAuth,
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER],
		acceptedStatuses: [COMPLETED, GRANTED]
	}),
    param('workspaceId').exists().trim().notEmpty(),
    validateRequest,
    botController.getBotByWorkspaceId
);

router.patch(
    '/:botId/active',
    requireAuth,
    requireBotAuth({
		acceptedRoles: [ADMIN, MEMBER],
		acceptedStatuses: [COMPLETED, GRANTED]
    }),
    body('isActive').isBoolean(),
    body('botKey'),
    validateRequest,
    botController.setBotActiveState
);

export default router;