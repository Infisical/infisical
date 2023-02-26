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
import { ADMIN, MEMBER } from '../../variables';

router.get(
    '/:workspaceId',
	requireAuth({
        acceptedAuthModes: ['jwt']
    }),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER]
	}),
    param('workspaceId').exists().trim().notEmpty(),
    validateRequest,
    botController.getBotByWorkspaceId
);

router.patch(
    '/:botId/active',
	requireAuth({
        acceptedAuthModes: ['jwt']
    }),
    requireBotAuth({
		acceptedRoles: [ADMIN, MEMBER]
    }),
    body('isActive').exists().isBoolean(),
    body('botKey'),
    validateRequest,
    botController.setBotActiveState
);

export default router;