import express from "express";
const router = express.Router();
import {
  requireAuth,
  requireIntegrationAuth,
  requireIntegrationAuthorizationAuth,
  requireWorkspaceAuth,
  validateRequest,
} from "../../middleware";
import {
  ADMIN,
  AuthMode,
  MEMBER
} from "../../variables";
import { body, param } from "express-validator";
import { integrationController } from "../../controllers/v1";

router.post(
  "/",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY],
  }),
  requireIntegrationAuthorizationAuth({
    acceptedRoles: [ADMIN, MEMBER],
    location: "body",
  }),
  body("integrationAuthId").exists().isString().trim(),
  body("app").trim(),
  body("isActive").exists().isBoolean(),
  body("appId").trim(),
  body("secretPath").default("/").isString().trim(),
  body("sourceEnvironment").trim(),
  body("targetEnvironment").trim(),
  body("targetEnvironmentId").trim(),
  body("targetService").trim(),
  body("targetServiceId").trim(),
  body("owner").trim(),
  body("path").trim(),
  body("region").trim(),
  body("metadata").optional().isObject().withMessage("Metadata should be an object"),
  body("metadata.secretSuffix").optional().isString().withMessage("Suffix should be a string"),
  validateRequest,
  integrationController.createIntegration
);

router.patch(
  "/:integrationId",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  requireIntegrationAuth({
    acceptedRoles: [ADMIN, MEMBER],
  }),
  param("integrationId").exists().trim(),
  body("isActive").exists().isBoolean(),
  body("app").exists().trim(),
  body("secretPath").default("/").isString().trim(),
  body("environment").exists().trim(),
  body("appId").exists(),
  body("targetEnvironment").exists(),
  body("owner").exists(),
  validateRequest,
  integrationController.updateIntegration
);

router.delete(
  "/:integrationId",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  requireIntegrationAuth({
    acceptedRoles: [ADMIN, MEMBER],
  }),
  param("integrationId").exists().trim(),
  validateRequest,
  integrationController.deleteIntegration
);

router.post(
  "/manual-sync",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER],
    locationWorkspaceId: "body",
  }),
  body("environment").isString().exists().trim(),
  body("workspaceId").exists().trim(),
  validateRequest,
  integrationController.manualSync
);

export default router;