import express from 'express';
const router = express.Router();
import { body, param } from 'express-validator';
import { requireAuth, validateRequest } from '../middleware';
import { membershipController } from '../controllers';

router.get( // used for CLI (deprecate)
	'/:workspaceId/connect',
	requireAuth,
	param('workspaceId').exists().trim(),
	validateRequest,
	membershipController.validateMembership
);

router.delete(
	'/:membershipId',
	requireAuth,
	param('membershipId').exists().trim(),
	validateRequest,
	membershipController.deleteMembership
);

router.post(
	'/:membershipId/change-role',
	requireAuth,
	body('role').exists().trim(),
	validateRequest,
	membershipController.changeMembershipRole
);

export default router;
