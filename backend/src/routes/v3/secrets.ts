import express from "express";
const router = express.Router();
import { requireAuth, requireWorkspaceAuth, validateRequest } from "../../middleware";
import { body, param, query } from "express-validator";
import { secretsController } from "../../controllers/v3";
import {
  ADMIN,
  AUTH_MODE_API_KEY,
  AUTH_MODE_JWT,
  AUTH_MODE_SERVICE_ACCOUNT,
  AUTH_MODE_SERVICE_TOKEN,
  MEMBER,
  PERMISSION_READ_SECRETS,
  PERMISSION_WRITE_SECRETS,
  SECRET_PERSONAL,
  SECRET_SHARED
} from "../../variables";

router.get(
  "/raw",
  query("workspaceId").optional().isString().trim(),
  query("environment").optional().isString().trim(),
  query("secretPath").default("/").isString().trim(),
  query("include_imports").optional().isBoolean().default(false),
  validateRequest,
  requireAuth({
    acceptedAuthModes: [
      AUTH_MODE_JWT,
      AUTH_MODE_API_KEY,
      AUTH_MODE_SERVICE_TOKEN,
      AUTH_MODE_SERVICE_ACCOUNT
    ]
  }),
  secretsController.getSecretsRaw
);

router.get(
  "/raw/:secretName",
  param("secretName").exists().isString().trim(),
  query("workspaceId").exists().isString().trim(),
  query("environment").exists().isString().trim(),
  query("secretPath").default("/").isString().trim(),
  query("type").optional().isIn([SECRET_SHARED, SECRET_PERSONAL]),
  validateRequest,
  requireAuth({
    acceptedAuthModes: [
      AUTH_MODE_JWT,
      AUTH_MODE_API_KEY,
      AUTH_MODE_SERVICE_TOKEN,
      AUTH_MODE_SERVICE_ACCOUNT
    ]
  }),
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER],
    locationWorkspaceId: "query",
    locationEnvironment: "query",
    requiredPermissions: [PERMISSION_READ_SECRETS],
    requireBlindIndicesEnabled: true,
    requireE2EEOff: true
  }),
  secretsController.getSecretByNameRaw
);

router.post(
  "/raw/:secretName",
  body("workspaceId").exists().isString().trim(),
  body("environment").exists().isString().trim(),
  body("type").exists().isIn([SECRET_SHARED, SECRET_PERSONAL]),
  body("secretValue").exists().isString().trim(),
  body("secretComment").default("").isString().trim(),
  body("secretPath").default("/").isString().trim(),
  validateRequest,
  requireAuth({
    acceptedAuthModes: [
      AUTH_MODE_JWT,
      AUTH_MODE_API_KEY,
      AUTH_MODE_SERVICE_TOKEN,
      AUTH_MODE_SERVICE_ACCOUNT
    ]
  }),
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER],
    locationWorkspaceId: "body",
    locationEnvironment: "body",
    requiredPermissions: [PERMISSION_WRITE_SECRETS],
    requireBlindIndicesEnabled: true,
    requireE2EEOff: true
  }),
  secretsController.createSecretRaw
);

router.patch(
  "/raw/:secretName",
  param("secretName").exists().isString().trim(),
  body("workspaceId").exists().isString().trim(),
  body("environment").exists().isString().trim(),
  body("type").exists().isIn([SECRET_SHARED, SECRET_PERSONAL]),
  body("secretValue").exists().isString().trim(),
  body("secretPath").default("/").isString().trim(),
  validateRequest,
  requireAuth({
    acceptedAuthModes: [
      AUTH_MODE_JWT,
      AUTH_MODE_API_KEY,
      AUTH_MODE_SERVICE_TOKEN,
      AUTH_MODE_SERVICE_ACCOUNT
    ]
  }),
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER],
    locationWorkspaceId: "body",
    locationEnvironment: "body",
    requiredPermissions: [PERMISSION_WRITE_SECRETS],
    requireBlindIndicesEnabled: true,
    requireE2EEOff: true
  }),
  secretsController.updateSecretByNameRaw
);

router.delete(
  "/raw/:secretName",
  param("secretName").exists().isString().trim(),
  body("workspaceId").exists().isString().trim(),
  body("environment").exists().isString().trim(),
  body("secretPath").default("/").isString().trim(),
  body("type").exists().isIn([SECRET_SHARED, SECRET_PERSONAL]),
  validateRequest,
  requireAuth({
    acceptedAuthModes: [
      AUTH_MODE_JWT,
      AUTH_MODE_API_KEY,
      AUTH_MODE_SERVICE_TOKEN,
      AUTH_MODE_SERVICE_ACCOUNT
    ]
  }),
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER],
    locationWorkspaceId: "body",
    locationEnvironment: "body",
    requiredPermissions: [PERMISSION_WRITE_SECRETS],
    requireBlindIndicesEnabled: true,
    requireE2EEOff: true
  }),
  secretsController.deleteSecretByNameRaw
);

router.get(
  "/",
  query("workspaceId").exists().isString().trim(),
  query("environment").exists().isString().trim(),
  query("secretPath").default("/").isString().trim(),
  validateRequest,
  requireAuth({
    acceptedAuthModes: [
      AUTH_MODE_JWT,
      AUTH_MODE_API_KEY,
      AUTH_MODE_SERVICE_TOKEN,
      AUTH_MODE_SERVICE_ACCOUNT
    ]
  }),
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER],
    locationWorkspaceId: "query",
    locationEnvironment: "query",
    requiredPermissions: [PERMISSION_READ_SECRETS],
    requireBlindIndicesEnabled: true,
    requireE2EEOff: false
  }),
  secretsController.getSecrets
);

router.post(
  "/:secretName",
  body("workspaceId").exists().isString().trim(),
  body("environment").exists().isString().trim(),
  body("type").exists().isIn([SECRET_SHARED, SECRET_PERSONAL]),
  body("secretKeyCiphertext").exists().isString().trim(),
  body("secretKeyIV").exists().isString().trim(),
  body("secretKeyTag").exists().isString().trim(),
  body("secretValueCiphertext").exists().isString().trim(),
  body("secretValueIV").exists().isString().trim(),
  body("secretValueTag").exists().isString().trim(),
  body("secretCommentCiphertext").optional().isString().trim(),
  body("secretCommentIV").optional().isString().trim(),
  body("secretCommentTag").optional().isString().trim(),
  body("secretPath").default("/").isString().trim(),
  validateRequest,
  requireAuth({
    acceptedAuthModes: [
      AUTH_MODE_JWT,
      AUTH_MODE_API_KEY,
      AUTH_MODE_SERVICE_TOKEN,
      AUTH_MODE_SERVICE_ACCOUNT
    ]
  }),
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER],
    locationWorkspaceId: "body",
    locationEnvironment: "body",
    requiredPermissions: [PERMISSION_WRITE_SECRETS],
    requireBlindIndicesEnabled: true,
    requireE2EEOff: false
  }),
  secretsController.createSecret
);

router.get(
  "/:secretName",
  param("secretName").exists().isString().trim(),
  query("workspaceId").exists().isString().trim(),
  query("environment").exists().isString().trim(),
  query("secretPath").default("/").isString().trim(),
  query("type").optional().isIn([SECRET_SHARED, SECRET_PERSONAL]),
  validateRequest,
  requireAuth({
    acceptedAuthModes: [
      AUTH_MODE_JWT,
      AUTH_MODE_API_KEY,
      AUTH_MODE_SERVICE_TOKEN,
      AUTH_MODE_SERVICE_ACCOUNT
    ]
  }),
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER],
    locationWorkspaceId: "query",
    locationEnvironment: "query",
    requiredPermissions: [PERMISSION_READ_SECRETS],
    requireBlindIndicesEnabled: true
  }),
  secretsController.getSecretByName
);

router.patch(
  "/:secretName",
  param("secretName").exists().isString().trim(),
  body("workspaceId").exists().isString().trim(),
  body("environment").exists().isString().trim(),
  body("type").exists().isIn([SECRET_SHARED, SECRET_PERSONAL]),
  body("secretValueCiphertext").exists().isString().trim(),
  body("secretValueIV").exists().isString().trim(),
  body("secretValueTag").exists().isString().trim(),
  body("secretPath").default("/").isString().trim(),
  validateRequest,
  requireAuth({
    acceptedAuthModes: [
      AUTH_MODE_JWT,
      AUTH_MODE_API_KEY,
      AUTH_MODE_SERVICE_TOKEN,
      AUTH_MODE_SERVICE_ACCOUNT
    ]
  }),
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER],
    locationWorkspaceId: "body",
    locationEnvironment: "body",
    requiredPermissions: [PERMISSION_WRITE_SECRETS],
    requireBlindIndicesEnabled: true,
    requireE2EEOff: false
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
    acceptedAuthModes: [
      AUTH_MODE_JWT,
      AUTH_MODE_API_KEY,
      AUTH_MODE_SERVICE_TOKEN,
      AUTH_MODE_SERVICE_ACCOUNT
    ]
  }),
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER],
    locationWorkspaceId: "body",
    locationEnvironment: "body",
    requiredPermissions: [PERMISSION_WRITE_SECRETS],
    requireBlindIndicesEnabled: true,
    requireE2EEOff: false
  }),
  secretsController.deleteSecretByName
);

export default router;
