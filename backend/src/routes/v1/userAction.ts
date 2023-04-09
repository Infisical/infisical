import express from 'express';
const router = express.Router();
import { requireAuth, validateRequest } from '../../middleware';
import { body, query } from 'express-validator';
import { userActionController } from '../../controllers/v1';
import { AUTH_MODE_JWT } from '../../variables';

// note: [userAction] will be deprecated in /v2 in favor of [action]
router.post(
	'/',
	requireAuth({
		acceptedAuthModes: [AUTH_MODE_JWT]
	}),
	body('action'),
	validateRequest,
	userActionController.addUserAction
);

router.get(
	'/',
	requireAuth({
		acceptedAuthModes: [AUTH_MODE_JWT]
	}),
	query('action'),
	validateRequest,
	userActionController.getUserAction
);

export default router;
