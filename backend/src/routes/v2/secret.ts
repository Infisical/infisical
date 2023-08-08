import express from "express";
import { 
  requireAuth, 
  requireSecretAuth,
  requireWorkspaceAuth,
  validateRequest, 
} from "../../middleware";
import { body, param, query } from "express-validator";
import {
  ADMIN, 
  AuthMode,
  MEMBER,
  PERMISSION_READ_SECRETS,
  PERMISSION_WRITE_SECRETS,
} from "../../variables";
import { CreateSecretRequestBody, ModifySecretRequestBody } from "../../types/secret";
import { secretController } from "../../controllers/v2";

// note to devs: stop supporting these routes [deprecated]

const router = express.Router();

router.post(
  "/batch-create/workspace/:workspaceId/environment/:environment",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT],
  }),
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER],
    locationWorkspaceId: "params",
  }),
  param("workspaceId").exists().isMongoId().trim(),
  param("environment").exists().trim(),
  body("secrets").exists().isArray().custom((value) => value.every((item: CreateSecretRequestBody) => typeof item === "object")),
  body("channel"),
  validateRequest,
  secretController.createSecrets
);

router.post(
  "/workspace/:workspaceId/environment/:environment",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT],
  }),
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER],
    locationWorkspaceId: "params",
  }),
  param("workspaceId").exists().isMongoId().trim(),
  param("environment").exists().trim(),
  body("secret").exists().isObject(),
  body("channel"),
  validateRequest,
  secretController.createSecret
);

router.get(
  "/workspace/:workspaceId",
  param("workspaceId").exists().trim(),
  query("environment").exists(),
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.SERVICE_TOKEN],
  }),
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER],
    locationWorkspaceId: "params",
  }),
  query("channel"),
  validateRequest,
  secretController.getSecrets
);

router.get(
  "/:secretId",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.SERVICE_TOKEN],
  }),
  requireSecretAuth({
    acceptedRoles: [ADMIN, MEMBER],
    requiredPermissions: [PERMISSION_READ_SECRETS],
  }),
  validateRequest,
  secretController.getSecret
);

router.delete(
  "/batch/workspace/:workspaceId/environment/:environmentName",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT],
  }),
  param("workspaceId").exists().isMongoId().trim(),
  param("environmentName").exists().trim(),
  body("secretIds").exists().isArray().custom(array => array.length > 0),
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER],
    locationWorkspaceId: "params",
  }),
  validateRequest,
  secretController.deleteSecrets
);

router.delete(
  "/:secretId",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT],
  }),
  requireSecretAuth({
    acceptedRoles: [ADMIN, MEMBER],
    requiredPermissions: [PERMISSION_READ_SECRETS, PERMISSION_WRITE_SECRETS],
  }),
  param("secretId").isMongoId(),
  validateRequest,
  secretController.deleteSecret
);

router.patch(
  "/batch-modify/workspace/:workspaceId/environment/:environmentName",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT],
  }),
  body("secrets").exists().isArray().custom((secrets: ModifySecretRequestBody[]) => secrets.length > 0),
  param("workspaceId").exists().isMongoId().trim(),
  param("environmentName").exists().trim(),
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER],
    locationWorkspaceId: "params",
  }),
  validateRequest,
  secretController.updateSecrets
);

router.patch(
  "/workspace/:workspaceId/environment/:environmentName",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT],
  }),
  body("secret").isObject(),
  param("workspaceId").exists().isMongoId().trim(),
  param("environmentName").exists().trim(),
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER],
    locationWorkspaceId: "params",
  }),
  validateRequest,
  secretController.updateSecret
);

export default router;
