import express from "express";
const router = express.Router();
import {
    requireAuth,
    requireMembershipOrgAuth,
    requireOrganizationAuth,
    validateRequest,
} from "../../middleware";
import { body, param } from "express-validator";
import { 
    ACCEPTED, 
    ADMIN, 
    AuthMode,
    MEMBER,
    OWNER
} from "../../variables";
import { organizationsController } from "../../controllers/v2";

// TODO: /POST to create membership

router.get(
    "/:organizationId/memberships",
    param("organizationId").exists().trim(),
    validateRequest,
    requireAuth({
        acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY],
    }),
    requireOrganizationAuth({
        acceptedRoles: [OWNER, ADMIN, MEMBER],
        acceptedStatuses: [ACCEPTED],
    }),
    organizationsController.getOrganizationMemberships
);

router.patch(
    "/:organizationId/memberships/:membershipId",
    param("organizationId").exists().trim(),
    param("membershipId").exists().trim(),
    body("role").exists().isString().trim().isIn([OWNER, ADMIN, MEMBER]),
    validateRequest,
    requireAuth({
        acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY],
    }),
    requireOrganizationAuth({
        acceptedRoles: [OWNER, ADMIN],
        acceptedStatuses: [ACCEPTED],
    }),
    requireMembershipOrgAuth({
        acceptedRoles: [OWNER, ADMIN],
        acceptedStatuses: [ACCEPTED],
    }),
    organizationsController.updateOrganizationMembership
);

router.delete(
    "/:organizationId/memberships/:membershipId",
    param("organizationId").exists().trim(),
    param("membershipId").exists().trim(),
    validateRequest,
    requireAuth({
        acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY],
    }),
    requireOrganizationAuth({
        acceptedRoles: [OWNER, ADMIN],
        acceptedStatuses: [ACCEPTED],
    }),
    requireMembershipOrgAuth({
        acceptedRoles: [OWNER, ADMIN],
        acceptedStatuses: [ACCEPTED],
    }),
    organizationsController.deleteOrganizationMembership
);

router.get(
    "/:organizationId/workspaces",
    param("organizationId").exists().trim(),
    validateRequest,
    requireAuth({
        acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY],
    }),
    requireOrganizationAuth({
        acceptedRoles: [OWNER, ADMIN],
        acceptedStatuses: [ACCEPTED],
    }),
    organizationsController.getOrganizationWorkspaces
);

router.get( // TODO endpoint: deprecate service accounts
    "/:organizationId/service-accounts",
    param("organizationId").exists().trim(),
    validateRequest,
    requireAuth({
        acceptedAuthModes: [AuthMode.JWT]
    }),
    requireOrganizationAuth({
        acceptedRoles: [OWNER, ADMIN],
        acceptedStatuses: [ACCEPTED],
    }),
    organizationsController.getOrganizationServiceAccounts
);

export default router;