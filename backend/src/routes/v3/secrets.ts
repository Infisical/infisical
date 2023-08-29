import express from "express";
const router = express.Router();
import { 
  requireAuth, 
  requireBlindIndicesEnabled, 
  requireE2EEOff,
  requireWorkspaceAuth,
  validateRequest 
} from "../../middleware";
import { body, param, query } from "express-validator";
import { secretsController } from "../../controllers/v3";
import {
  ADMIN,
  AuthMode,
  MEMBER,
  PERMISSION_READ_SECRETS,
  PERMISSION_WRITE_SECRETS,
  SECRET_PERSONAL,
  SECRET_SHARED
} from "../../variables";

router.get(
  "/raw",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN]
  }),
  secretsController.getSecretsRaw
);

router.get(
  "/raw/:secretName",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN]
  }),
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER],
    locationWorkspaceId: "query",
    locationEnvironment: "query",
    requiredPermissions: [PERMISSION_READ_SECRETS]
  }),
  requireBlindIndicesEnabled({
    locationWorkspaceId: "query"
  }),
  requireE2EEOff({
    locationWorkspaceId: "query"
  }),
  secretsController.getSecretByNameRaw
);

router.post(
  "/raw/:secretName",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN]
  }),
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER],
    locationWorkspaceId: "body",
    locationEnvironment: "body",
    requiredPermissions: [PERMISSION_WRITE_SECRETS]
  }),
  requireBlindIndicesEnabled({
    locationWorkspaceId: "body"
  }),
  requireE2EEOff({
    locationWorkspaceId: "body"
  }),
  secretsController.createSecretRaw
);

router.patch(
  "/raw/:secretName",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN]
  }),
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER],
    locationWorkspaceId: "body",
    locationEnvironment: "body",
    requiredPermissions: [PERMISSION_WRITE_SECRETS]
  }),
  requireBlindIndicesEnabled({
    locationWorkspaceId: "body"
  }),
  requireE2EEOff({
    locationWorkspaceId: "body"
  }),
  secretsController.updateSecretByNameRaw
);

router.delete(
  "/raw/:secretName",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN]
  }),
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER],
    locationWorkspaceId: "body",
    locationEnvironment: "body",
    requiredPermissions: [PERMISSION_WRITE_SECRETS]
  }),
  requireBlindIndicesEnabled({
    locationWorkspaceId: "body"
  }),
  requireE2EEOff({
    locationWorkspaceId: "body"
  }),
  secretsController.deleteSecretByNameRaw
);

router.get(
  "/",
  query("workspaceId").exists().isString().trim(),
  query("environment").exists().isString().trim(),
  query("folderId").optional().isString().trim(),
  query("secretPath").default("/").isString().trim(),
  validateRequest,
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN]
  }),
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER],
    locationWorkspaceId: "query",
    locationEnvironment: "query",
    requiredPermissions: [PERMISSION_READ_SECRETS]
  }),
  requireBlindIndicesEnabled({
    locationWorkspaceId: "query"
  }),
  secretsController.getSecrets
);

router.post(
  "/:secretName",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN]
  }),
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER],
    locationWorkspaceId: "body",
    locationEnvironment: "body",
    requiredPermissions: [PERMISSION_WRITE_SECRETS]
  }),
  requireBlindIndicesEnabled({
    locationWorkspaceId: "body"
  }),
  secretsController.createSecret
);

router.get(
  "/:secretName",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN]
  }),
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER],
    locationWorkspaceId: "query",
    locationEnvironment: "query",
    requiredPermissions: [PERMISSION_READ_SECRETS]
  }),
  requireBlindIndicesEnabled({
    locationWorkspaceId: "query"
  }),
  secretsController.getSecretByName
);

router.patch(
  "/:secretName",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN]
  }),
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER],
    locationWorkspaceId: "body",
    locationEnvironment: "body",
    requiredPermissions: [PERMISSION_WRITE_SECRETS]
  }),
  requireBlindIndicesEnabled({
    locationWorkspaceId: "body"
  }),
  secretsController.updateSecretByName
);

router.delete(
  "/:secretName",
  param("secretName").exists().isString().trim(),
  body("workspaceId").exists().isString().trim(),
  body("environment").exists().isString().trim(),
  body("secretPath").default("/").isString().trim(),
  body("type").exists().isIn([SECRET_SHARED, SECRET_PERSONAL]),
  validateRequest,
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN]
  }),
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER],
    locationWorkspaceId: "body",
    locationEnvironment: "body",
    requiredPermissions: [PERMISSION_WRITE_SECRETS]
  }),
  requireBlindIndicesEnabled({
    locationWorkspaceId: "body"
  }),
  secretsController.deleteSecretByName
);

export default router;
