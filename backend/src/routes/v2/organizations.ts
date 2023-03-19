import express from 'express';
const router = express.Router();
import {
    requireAuth,
    requireOrganizationAuth,
    requireMembershipOrgAuth,
    validateRequest
} from '../../middleware';
import { body, param } from 'express-validator';
import { OWNER, ADMIN, MEMBER, ACCEPTED } from '../../variables';
import { organizationsController } from '../../controllers/v2';

// TODO: /POST to create membership

router.get(
    '/:organizationId/memberships',
    param('organizationId').exists().trim(),
    validateRequest,
    requireAuth({
        acceptedAuthModes: ['jwt', 'apiKey']
    }),
    requireOrganizationAuth({
        acceptedRoles: [OWNER, ADMIN, MEMBER],
        acceptedStatuses: [ACCEPTED]
    }),
    organizationsController.getOrganizationMemberships
);

router.patch(
    '/:organizationId/memberships/:membershipId',
    param('organizationId').exists().trim(),
    param('membershipId').exists().trim(),
    body('role').exists().isString().trim().isIn([OWNER, ADMIN, MEMBER]),
    validateRequest,
    requireAuth({
        acceptedAuthModes: ['jwt', 'apiKey']
    }),
    requireOrganizationAuth({
        acceptedRoles: [OWNER, ADMIN],
        acceptedStatuses: [ACCEPTED]
    }),
    requireMembershipOrgAuth({
        acceptedRoles: [OWNER, ADMIN],
        acceptedStatuses: [ACCEPTED]
    }),
    organizationsController.updateOrganizationMembership
);

router.delete(
    '/:organizationId/memberships/:membershipId',
    param('organizationId').exists().trim(),
    param('membershipId').exists().trim(),
    validateRequest,
    requireAuth({
        acceptedAuthModes: ['jwt', 'apiKey']
    }),
    requireOrganizationAuth({
        acceptedRoles: [OWNER, ADMIN],
        acceptedStatuses: [ACCEPTED]
    }),
    requireMembershipOrgAuth({
        acceptedRoles: [OWNER, ADMIN],
        acceptedStatuses: [ACCEPTED]
    }),
    organizationsController.deleteOrganizationMembership
);

router.get(
    '/:organizationId/workspaces',
    param('organizationId').exists().trim(),
    validateRequest,
    requireAuth({
        acceptedAuthModes: ['jwt', 'apiKey']
    }),
    requireOrganizationAuth({
        acceptedRoles: [OWNER, ADMIN],
        acceptedStatuses: [ACCEPTED]
    }),
    organizationsController.getOrganizationWorkspaces
);

router.get(
    '/:organizationId/service-accounts',
    param('organizationId').exists().trim(),
    validateRequest,
    requireAuth({
        acceptedAuthModes: ['jwt']
    }),
    requireOrganizationAuth({
        acceptedRoles: [OWNER, ADMIN],
        acceptedStatuses: [ACCEPTED]
    }),
    organizationsController.getOrganizationServiceAccounts
);

export default router;