import express from 'express';
const router = express.Router();
import {
	requireAuth,
	requireWorkspaceAuth,
	requireServiceTokenAuth,
	validateRequest
} from '../../middleware';
import { body } from 'express-validator';
import { ADMIN, MEMBER } from '../../variables';
import { serviceTokenController } from '../../controllers/v1';

// note: deprecate service-token routes in favor of service-token data routes/structure

router.get(
	'/',
	requireServiceTokenAuth,
	serviceTokenController.getServiceToken
);

router.post(
	'/',
	requireAuth({
		acceptedAuthModes: ['jwt']
	}),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER],
		location: 'body'
	}),
	body('name').exists().trim().notEmpty(),
	body('workspaceId').exists().trim().notEmpty(),
	body('environment').exists().trim().notEmpty(),
	body('expiresIn'), // measured in ms
	body('publicKey').exists().trim().notEmpty(),
	body('encryptedKey').exists().trim().notEmpty(),
	body('nonce').exists().trim().notEmpty(),
	validateRequest,
	serviceTokenController.createServiceToken
);

export default router;
