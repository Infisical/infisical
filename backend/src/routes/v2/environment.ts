import express from "express";
const router = express.Router();
import { environmentController } from "../../controllers/v2";
import { requireAuth } from "../../middleware";
import { AuthMode } from "../../variables";

router.post(
  "/:workspaceId/environments",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  environmentController.createWorkspaceEnvironment
);

router.put(
  "/:workspaceId/environments",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
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
    acceptedAuthModes: [AuthMode.JWT]
  }),
  environmentController.deleteWorkspaceEnvironment
);

router.get(
  "/:workspaceId/environments",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  environmentController.getAllAccessibleEnvironmentsOfWorkspace
);

export default router;
