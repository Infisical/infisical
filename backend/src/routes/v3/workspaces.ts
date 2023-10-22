import express from "express";
const router = express.Router();
import { requireAuth } from "../../middleware";
import { workspacesController } from "../../controllers/v3";
import { AuthMode } from "../../variables";

// -- migration to blind indices endpoints

router.get(
  "/:workspaceId/secrets/blind-index-status",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  workspacesController.getWorkspaceBlindIndexStatus
);

router.get(
  // allow admins to get all workspace secrets (part of blind indices migration)
  "/:workspaceId/secrets",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  workspacesController.getWorkspaceSecrets
);

router.post(
  // allow admins to name all workspace secrets (part of blind indices migration)
  "/:workspaceId/secrets/names",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  workspacesController.nameWorkspaceSecrets
);

// --

router.get(
  "/:workspaceId/service-token",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  workspacesController.getWorkspaceServiceTokenData
);

export default router;
