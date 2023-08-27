import express from "express";
const router = express.Router();
import { requireAuth, requireWorkspaceAuth, validateRequest } from "../../middleware";
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

// TODO(akhilmhdh): tony please split the requireWorkspaceAuth to multiple middlewares
// IP checking into another one
router.get(
  "/raw/:secretName",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN]
  }),
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER],
    locationWorkspaceId: "query",
    locationEnvironment: "query",
    requiredPermissions: [PERMISSION_READ_SECRETS],
    requireBlindIndicesEnabled: true,
    requireE2EEOff: true,
    checkIPAllowlist: false
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
    requiredPermissions: [PERMISSION_WRITE_SECRETS],
    requireBlindIndicesEnabled: true,
    requireE2EEOff: true,
    checkIPAllowlist: false
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
    requiredPermissions: [PERMISSION_WRITE_SECRETS],
    requireBlindIndicesEnabled: true,
    requireE2EEOff: true,
    checkIPAllowlist: false
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
    requiredPermissions: [PERMISSION_WRITE_SECRETS],
    requireBlindIndicesEnabled: true,
    requireE2EEOff: true,
    checkIPAllowlist: false
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
    requiredPermissions: [PERMISSION_READ_SECRETS],
    requireBlindIndicesEnabled: true,
    requireE2EEOff: false,
    checkIPAllowlist: false
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
    requiredPermissions: [PERMISSION_WRITE_SECRETS],
    requireBlindIndicesEnabled: true,
    requireE2EEOff: false,
    checkIPAllowlist: false
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
    requiredPermissions: [PERMISSION_READ_SECRETS],
    requireBlindIndicesEnabled: true,
    checkIPAllowlist: false
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
    requiredPermissions: [PERMISSION_WRITE_SECRETS],
    requireBlindIndicesEnabled: true,
    requireE2EEOff: false,
    checkIPAllowlist: false
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
    requiredPermissions: [PERMISSION_WRITE_SECRETS],
    requireBlindIndicesEnabled: true,
    requireE2EEOff: false,
    checkIPAllowlist: false
  }),
  secretsController.deleteSecretByName
);

export default router;
