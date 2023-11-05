import express from "express";
const router = express.Router();
import { requireAuth } from "../../middleware";
import { AuthMode } from "../../variables";
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

router.post(
  "/",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  organizationsController.createOrganization
);

router.delete(
  "/:organizationId",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY]
  }),
  organizationsController.deleteOrganizationById
);

export default router;
