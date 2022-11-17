import express from 'express';
const router = express.Router();
import {
	requireAuth,
	requireWorkspaceAuth,
	requireServiceTokenAuth,
	validateRequest
} from '../middleware';
import { body } from 'express-validator';
import { ADMIN, MEMBER, GRANTED } from '../variables';
import { serviceTokenController } from '../controllers';

// TODO: revoke service token

router.get(
	'/',
	requireServiceTokenAuth,
	serviceTokenController.getServiceToken
);

router.post(
	'/',
	requireAuth,
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER],
		acceptedStatuses: [GRANTED],
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
