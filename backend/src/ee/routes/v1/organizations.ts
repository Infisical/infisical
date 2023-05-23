import express from 'express';
const router = express.Router();
import {
    requireAuth,
    requireOrganizationAuth,
    validateRequest
} from '../../../middleware';
import { param, body } from 'express-validator';
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

router.get(
    '/:organizationId/billing-details/payment-methods',
    requireAuth({
		acceptedAuthModes: ['jwt', 'apiKey']
	}),
    requireOrganizationAuth({
        acceptedRoles: [OWNER, ADMIN, MEMBER],
        acceptedStatuses: [ACCEPTED]
    }),
    param('organizationId').exists().trim(),
    validateRequest,
    organizationsController.getOrganizationPmtMethods
);

router.post(
    '/:organizationId/billing-details/payment-methods',
    requireAuth({
		acceptedAuthModes: ['jwt', 'apiKey']
	}),
    requireOrganizationAuth({
        acceptedRoles: [OWNER, ADMIN, MEMBER],
        acceptedStatuses: [ACCEPTED]
    }),
    param('organizationId').exists().trim(),
    body('success_url').exists().isString(),
    body('cancel_url').exists().isString(),
    validateRequest,
    organizationsController.addOrganizationPmtMethod
);

router.delete(
    '/:organizationId/billing-details/payment-methods/:pmtMethodId',
    requireAuth({
		acceptedAuthModes: ['jwt', 'apiKey']
	}),
    requireOrganizationAuth({
        acceptedRoles: [OWNER, ADMIN, MEMBER],
        acceptedStatuses: [ACCEPTED]
    }),
    param('organizationId').exists().trim(),
    validateRequest,
    organizationsController.deleteOrganizationPmtMethod
);

export default router;