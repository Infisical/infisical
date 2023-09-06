import express from "express";
const router = express.Router();
import { requireAuth } from "../../middleware";
import { AuthMode } from "../../variables";
import { membershipController, workspaceController } from "../../controllers/v1";

router.get(
  "/:workspaceId/keys",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  workspaceController.getWorkspacePublicKeys
);

router.get(
  "/:workspaceId/users",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  workspaceController.getWorkspaceMemberships
);

router.get(
  "/",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY]
  }),
  workspaceController.getWorkspaces
);

router.get(
  "/:workspaceId",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  workspaceController.getWorkspace
);

router.post(
  "/",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  workspaceController.createWorkspace
);

router.delete(
  "/:workspaceId",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  workspaceController.deleteWorkspace
);

router.post(
  "/:workspaceId/name",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  workspaceController.changeWorkspaceName
);

router.post(
  "/:workspaceId/invite-signup",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  membershipController.inviteUserToWorkspace
);

router.get(
  "/:workspaceId/integrations",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  workspaceController.getWorkspaceIntegrations
);

router.get(
  "/:workspaceId/authorizations",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  workspaceController.getWorkspaceIntegrationAuthorizations
);

router.get(
  "/:workspaceId/service-tokens", // TODO endpoint: deprecate
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  workspaceController.getWorkspaceServiceTokens
);

export default router;
