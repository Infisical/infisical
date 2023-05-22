import express from 'express';
const router = express.Router();
import {
    requireAuth,
    requireOrganizationAuth,
    validateRequest
} from '../../../middleware';
import { param } from 'express-validator';
import { organizationsController } from '../../controllers/v1';
import {
    OWNER, ADMIN, MEMBER, ACCEPTED
} from '../../../variables';

router.get(
    '/:organizationId/plan',
    requireAuth({
		acceptedAuthModes: ['jwt', 'apiKey']
	}),
    requireOrganizationAuth({
        acceptedRoles: [OWNER, ADMIN, MEMBER],
        acceptedStatuses: [ACCEPTED]
    }),
    param('organizationId').exists().trim(),
    validateRequest,
    organizationsController.getOrganizationPlan
);

export default router;