import express from "express";
const router = express.Router();
import {
  requireAuth,
  requireOrganizationAuth
} from "../../middleware";
import { ACCEPTED, ADMIN, AuthMode, OWNER } from "../../variables";
import { organizationsController } from "../../controllers/v2";

// TODO: /POST to create membership

router.get(
  "/:organizationId/memberships",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY]
  }),
  organizationsController.getOrganizationMemberships
);

router.patch(
  "/:organizationId/memberships/:membershipId",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY]
  }),
  organizationsController.updateOrganizationMembership
);

router.delete(
  "/:organizationId/memberships/:membershipId",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY]
  }),
  organizationsController.deleteOrganizationMembership
);

router.get(
  "/:organizationId/workspaces",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY]
  }),
  organizationsController.getOrganizationWorkspaces
);

router.get(
  // TODO endpoint: deprecate service accounts
  "/:organizationId/service-accounts",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  requireOrganizationAuth({
    acceptedRoles: [OWNER, ADMIN],
    acceptedStatuses: [ACCEPTED]
  }),
  organizationsController.getOrganizationServiceAccounts
);

export default router;
