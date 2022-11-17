import express from 'express';
const router = express.Router();
import { requireAuth, validateRequest } from '../middleware';
import { body, query } from 'express-validator';
import { userActionController } from '../controllers';

router.post(
	'/',
	requireAuth,
	body('action'),
	validateRequest,
	userActionController.addUserAction
);

router.get(
	'/',
	requireAuth,
	query('action'),
	validateRequest,
	userActionController.getUserAction
);

export default router;
