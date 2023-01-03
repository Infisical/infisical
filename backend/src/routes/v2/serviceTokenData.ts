import express from 'express';
const router = express.Router();
import {
    requireAuth,
    requireWorkspaceAuth,
    requireServiceTokenDataAuth,
    validateRequest
} from '../../middleware';
import { param, body } from 'express-validator';
import {
    ADMIN,
    MEMBER,
    COMPLETED,
    GRANTED
} from '../../variables';
import { serviceTokenDataController } from '../../controllers/v2';

router.get(
    '/',
    requireAuth({
        acceptedAuthModes: ['serviceToken']
    }),
    serviceTokenDataController.getServiceTokenData
);

router.post(
    '/',
	requireAuth({
		acceptedAuthModes: ['jwt']
	}),
    requireWorkspaceAuth({
        acceptedRoles: [ADMIN, MEMBER],
        acceptedStatuses: [COMPLETED, GRANTED],
        location: 'body'
    }),
    body('name').exists().trim(),
    body('workspaceId'),
    body('environment'),
    body('encryptedKey'),
    body('iv'),
    body('tag'),
    body('expiresIn'), // measured in ms
    validateRequest,
    serviceTokenDataController.createServiceTokenData
);

router.delete(
    '/:serviceTokenDataId',
	requireAuth({
		acceptedAuthModes: ['jwt']
	}),
    requireServiceTokenDataAuth({
        acceptedRoles: [ADMIN, MEMBER],
        acceptedStatuses: [COMPLETED, GRANTED],
    }),
    param('serviceTokenDataId').exists().trim(),
    validateRequest,
    serviceTokenDataController.deleteServiceTokenData
);

export default router;