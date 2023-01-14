import express from 'express';
const router = express.Router();
import { body, param } from 'express-validator';
import { requireAuth, validateRequest } from '../../middleware';
import { membershipController } from '../../controllers/v1';

router.get( // used for old CLI (deprecate)
	'/:workspaceId/connect',
	requireAuth({
        acceptedAuthModes: ['jwt']
    }),
	param('workspaceId').exists().trim(),
	validateRequest,
	membershipController.validateMembership
);

router.delete(
	'/:membershipId',
	requireAuth({
        acceptedAuthModes: ['jwt']
    }),
	param('membershipId').exists().trim(),
	validateRequest,
	membershipController.deleteMembership
);

router.post(
	'/:membershipId/change-role',
	requireAuth({
        acceptedAuthModes: ['jwt']
    }),
	body('role').exists().trim(),
	validateRequest,
	membershipController.changeMembershipRole
);

export default router;
