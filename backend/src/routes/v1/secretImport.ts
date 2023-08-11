import express from "express";
import { body, param, query } from "express-validator";
import { secretImportController } from "../../controllers/v1";
import { requireAuth, requireWorkspaceAuth, validateRequest } from "../../middleware";
import { ADMIN, AuthMode, MEMBER } from "../../variables";
const router = express.Router();

router.post(
  "/",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT,AuthMode.SERVICE_TOKEN]
  }),
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER],
    locationWorkspaceId: "body"
  }),
  body("workspaceId").exists().isString().trim().notEmpty(),
  body("environment").exists().isString().trim().notEmpty(),
  body("folderId").default("root").isString().trim(),
  body("secretImport").exists().isObject(),
  body("secretImport.environment").isString().exists().trim(),
  body("secretImport.secretPath").isString().exists().trim(),
  validateRequest,
  secretImportController.createSecretImport
);

router.put(
  "/:id",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT,AuthMode.SERVICE_TOKEN]
  }),
  param("id").exists().isString().trim(),
  body("secretImports").exists().isArray(),
  body("secretImports.*.environment").isString().exists().trim(),
  body("secretImports.*.secretPath").isString().exists().trim(),
  validateRequest,
  secretImportController.updateSecretImport
);

router.delete(
  "/:id",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT,AuthMode.SERVICE_TOKEN]
  }),
  param("id").exists().isString().trim(),
  body("secretImportPath").isString().exists().trim(),
  body("secretImportEnv").isString().exists().trim(),
  validateRequest,
  secretImportController.deleteSecretImport
);

router.get(
  "/",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT,AuthMode.SERVICE_TOKEN]
  }),
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER],
    locationWorkspaceId: "query"
  }),
  query("workspaceId").exists().isString().trim().notEmpty(),
  query("environment").exists().isString().trim().notEmpty(),
  query("folderId").default("root").isString().trim(),
  validateRequest,
  secretImportController.getSecretImports
);

router.get(
  "/secrets",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT,AuthMode.SERVICE_TOKEN]
  }),
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER],
    locationWorkspaceId: "query"
  }),
  query("workspaceId").exists().isString().trim().notEmpty(),
  query("environment").exists().isString().trim().notEmpty(),
  query("folderId").default("root").isString().trim(),
  validateRequest,
  secretImportController.getAllSecretsFromImport
);

export default router;
