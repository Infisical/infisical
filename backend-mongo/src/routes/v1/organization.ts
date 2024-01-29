import express from "express";
const router = express.Router();
import { requireAuth } from "../../middleware";
import { AuthMode } from "../../variables";
import { organizationController } from "../../controllers/v1";

router.get(
  // TODO endpoint: deprecate (moved to api/v2/users/me/organizations)
  "/",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  organizationController.getOrganizations
);

router.get(
  "/:organizationId",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  organizationController.getOrganization
);

router.get(
  // TODO endpoint: deprecate (moved to api/v2/organizations/:organizationId/memberships)
  "/:organizationId/users",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  organizationController.getOrganizationMembers
);

router.get(
  // TODO endpoint: move to /v2/users/me/organizations/:organizationId/workspaces
  "/:organizationId/my-workspaces", // deprecated (moved to api/v2/organizations/:organizationId/workspaces)
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  organizationController.getOrganizationWorkspaces
);

router.patch(
  "/:organizationId/name",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  organizationController.changeOrganizationName
);

router.get(
  "/:organizationId/incidentContactOrg",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  organizationController.getOrganizationIncidentContacts
);

router.post(
  "/:organizationId/incidentContactOrg",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  organizationController.addOrganizationIncidentContact
);

router.delete(
  "/:organizationId/incidentContactOrg",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  organizationController.deleteOrganizationIncidentContact
);

router.post(
  "/:organizationId/customer-portal-session", // TODO endpoint: move to EE
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  organizationController.createOrganizationPortalSession
);

router.get(
  "/:organizationId/workspace-memberships",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  organizationController.getOrganizationMembersAndTheirWorkspaces
);

export default router;
