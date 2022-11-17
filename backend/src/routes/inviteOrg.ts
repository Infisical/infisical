import express from 'express';
const router = express.Router();
import { body } from 'express-validator';
import { requireAuth, validateRequest } from '../middleware';
import { membershipOrgController } from '../controllers';

router.post(
	'/signup',
	requireAuth,
	body('inviteeEmail').exists().trim().notEmpty().isEmail(),
	body('organizationId').exists().trim().notEmpty(),
	validateRequest,
	membershipOrgController.inviteUserToOrganization
);

router.post(
	'/verify',
	body('email').exists().trim().notEmpty(),
	body('code').exists().trim().notEmpty(),
	validateRequest,
	membershipOrgController.verifyUserToOrganization
);

export default router;
