import express from "express";
const router = express.Router();
import { body, param } from "express-validator";
import { environmentController } from "../../controllers/v2";
import {
  requireAuth,
  requireWorkspaceAuth,
  validateRequest,
} from "../../middleware";
import {
  ADMIN, 
  AuthMode,
  MEMBER
} from "../../variables";

router.post(
  "/:workspaceId/environments",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY],
  }),
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER],
    locationWorkspaceId: "params",
  }),
  param("workspaceId").exists().trim(),
  body("environmentSlug").exists().trim(),
  body("environmentName").exists().trim(),
  validateRequest,
  environmentController.createWorkspaceEnvironment
);

router.put(
  "/:workspaceId/environments",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY],
  }),
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER],
    locationWorkspaceId: "params",
  }),
  param("workspaceId").exists().trim(),
  body("environmentSlug").exists().trim(),
  body("environmentName").exists().trim(),
  body("oldEnvironmentSlug").exists().trim(),
  validateRequest,
  environmentController.renameWorkspaceEnvironment
);

router.patch(
  "/:workspaceId/environments",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY],
  }),
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER],
    locationWorkspaceId: "params",
  }),
  param("workspaceId").exists().trim(),
  body("environmentSlug").exists().isString().trim(),
  body("environmentName").exists().isString().trim(),
  body("otherEnvironmentSlug").exists().isString().trim(),
  body("otherEnvironmentName").exists().isString().trim(),
  validateRequest,
  environmentController.reorderWorkspaceEnvironments
);

router.delete(
  "/:workspaceId/environments",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY],
  }),
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN],
    locationWorkspaceId: "params",
  }),
  param("workspaceId").exists().trim(),
  body("environmentSlug").exists().trim(),
  validateRequest,
  environmentController.deleteWorkspaceEnvironment
);

router.get(
  "/:workspaceId/environments",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY],
  }),
  requireWorkspaceAuth({
    acceptedRoles: [MEMBER, ADMIN],
    locationWorkspaceId: "params",
  }),
  param("workspaceId").exists().trim(),
  validateRequest,
  environmentController.getAllAccessibleEnvironmentsOfWorkspace
);

export default router;