import express from "express";
const router = express.Router();
import { environmentController } from "@app/controllers/v2";
import { requireAuth } from "@app/middleware";
import { AuthMode } from "@app/variables";

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

router.get(
  "/:workspaceId/environments",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY]
  }),
  environmentController.getAllAccessibleEnvironmentsOfWorkspace
);

export default router;
