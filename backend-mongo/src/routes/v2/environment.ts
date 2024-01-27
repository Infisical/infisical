import express from "express";
const router = express.Router();
import { environmentController } from "../../controllers/v2";
import { requireAuth } from "../../middleware";
import { AuthMode } from "../../variables";

router.post(
  "/:workspaceId/environments",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY, AuthMode.IDENTITY_ACCESS_TOKEN]
  }),
  environmentController.createWorkspaceEnvironment
);

router.put(
  "/:workspaceId/environments",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY, AuthMode.IDENTITY_ACCESS_TOKEN]
  }),
  environmentController.renameWorkspaceEnvironment
);

router.patch(
  "/:workspaceId/environments",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY, AuthMode.IDENTITY_ACCESS_TOKEN]
  }),
  environmentController.reorderWorkspaceEnvironments
);

router.delete(
  "/:workspaceId/environments",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY, AuthMode.IDENTITY_ACCESS_TOKEN]
  }),
  environmentController.deleteWorkspaceEnvironment
);

export default router;
