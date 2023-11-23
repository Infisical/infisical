import express from "express";
const router = express.Router();
import { environmentController } from "../../controllers/v2";
import { requireAuth } from "../../middleware";
import { AuthMode } from "../../variables";

router.post(
  "/:workspaceId/environments",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY]
  }),
  environmentController.createWorkspaceEnvironment
);

router.put(
  "/:workspaceId/environments",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY]
  }),
  environmentController.renameWorkspaceEnvironment
);

router.patch(
  "/:workspaceId/environments",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY]
  }),
  environmentController.reorderWorkspaceEnvironments
);

router.delete(
  "/:workspaceId/environments",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY]
  }),
  environmentController.deleteWorkspaceEnvironment
);

export default router;
