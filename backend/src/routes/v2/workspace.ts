import express from "express";
const router = express.Router();
import { body, param, query } from "express-validator";
import { requireAuth, requireWorkspaceAuth, validateRequest } from "../../middleware";
import { ADMIN, AuthMode, MEMBER } from "../../variables";
import { workspaceController } from "../../controllers/v2";

router.post(
  // TODO endpoint: deprecate (moved to POST v3/secrets)
  "/:workspaceId/secrets",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER],
    locationWorkspaceId: "params"
  }),
  body("secrets").exists(),
  body("keys").exists(),
  body("environment").exists().trim().notEmpty(),
  body("channel"),
  param("workspaceId").exists().trim(),
  validateRequest,
  workspaceController.pushWorkspaceSecrets
);

router.get(
  // TODO endpoint: deprecate (moved to GET v3/secrets)
  "/:workspaceId/secrets",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.SERVICE_TOKEN]
  }),
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER],
    locationWorkspaceId: "params"
  }),
  query("environment").exists().trim(),
  query("channel"),
  param("workspaceId").exists().trim(),
  validateRequest,
  workspaceController.pullSecrets
);

router.get(
  // TODO endpoint: consider moving to v3/users/me/workspaces/:workspaceId/key
  "/:workspaceId/encrypted-key",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY]
  }),
  workspaceController.getWorkspaceKey
);

router.get(
  "/:workspaceId/service-token-data",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  workspaceController.getWorkspaceServiceTokenData
);

router.get(
  // new - TODO: rewire dashboard to this route
  "/:workspaceId/memberships",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY]
  }),
  workspaceController.getWorkspaceMemberships
);

router.patch(
  // TODO - rewire dashboard to this route
  "/:workspaceId/memberships/:membershipId",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY]
  }),
  workspaceController.updateWorkspaceMembership
);

router.delete(
  // TODO - rewire dashboard to this route
  "/:workspaceId/memberships/:membershipId",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY]
  }),
  workspaceController.deleteWorkspaceMembership
);

router.patch(
  "/:workspaceId/auto-capitalization",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  workspaceController.toggleAutoCapitalization
);

export default router;
