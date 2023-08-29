import express from "express";
const router = express.Router();
import {
  requireAuth,
  requireSecretsAuth,
  requireWorkspaceAuth,
  validateRequest
} from "../../middleware";
import { body } from "express-validator";
import { secretsController } from "../../controllers/v2";
import {
  ADMIN,
  AuthMode,
  MEMBER,
  PERMISSION_READ_SECRETS,
  PERMISSION_WRITE_SECRETS,
  SECRET_PERSONAL,
  SECRET_SHARED
} from "../../variables";

router.post(
  // TODO endpoint: strongly consider deprecation in favor of a single operation experience on dashboard
  "/batch",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN]
  }),
  secretsController.batchSecrets
);

router.post(
  // TODO endpoint: deprecate (moved to POST api/v3/secrets)
  "/",
  body("workspaceId").exists().isString().trim(),
  body("environment").exists().isString().trim(),
  body("folderId").default("root").isString().trim(),
  body("secretPath").optional().isString().trim(),
  body("secrets")
    .exists()
    .custom((value) => {
      if (Array.isArray(value)) {
        // case: create multiple secrets
        if (value.length === 0) throw new Error("secrets cannot be an empty array");
        for (const secret of value) {
          if (
            !secret.type ||
            !(secret.type === SECRET_PERSONAL || secret.type === SECRET_SHARED) ||
            !secret.secretKeyCiphertext ||
            !secret.secretKeyIV ||
            !secret.secretKeyTag ||
            typeof secret.secretValueCiphertext !== "string" ||
            !secret.secretValueIV ||
            !secret.secretValueTag
          ) {
            throw new Error(
              "secrets array must contain objects that have required secret properties"
            );
          }
        }
      } else if (typeof value === "object") {
        // case: update 1 secret
        if (
          !value.type ||
          !(value.type === SECRET_PERSONAL || value.type === SECRET_SHARED) ||
          !value.secretKeyCiphertext ||
          !value.secretKeyIV ||
          !value.secretKeyTag ||
          !value.secretValueCiphertext ||
          !value.secretValueIV ||
          !value.secretValueTag
        ) {
          throw new Error("secrets object is missing required secret properties");
        }
      } else {
        throw new Error("secrets must be an object or an array of objects");
      }

      return true;
    }),
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
  secretsController.createSecrets
);

router.get(
  // TODO endpoint: deprecate (moved to GET api/v3/secrets)
  "/",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN]
  }),
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER],
    locationWorkspaceId: "query",
    locationEnvironment: "query",
    requiredPermissions: [PERMISSION_READ_SECRETS]
  }),
  secretsController.getSecrets
);

router.patch(
  // TODO endpoint: deprecate (moved to PATCH api/v3/secrets)
  "/",
  body("secrets")
    .exists()
    .custom((value) => {
      if (Array.isArray(value)) {
        // case: update multiple secrets
        if (value.length === 0) throw new Error("secrets cannot be an empty array");
        for (const secret of value) {
          if (!secret.id) {
            throw new Error("Each secret must contain a ID property");
          }
        }
      } else if (typeof value === "object") {
        // case: update 1 secret
        if (!value.id) {
          throw new Error("secret must contain a ID property");
        }
      } else {
        throw new Error("secrets must be an object or an array of objects");
      }

      return true;
    }),
  validateRequest,
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN]
  }),
  requireSecretsAuth({
    acceptedRoles: [ADMIN, MEMBER],
    requiredPermissions: [PERMISSION_WRITE_SECRETS]
  }),
  secretsController.updateSecrets
);

router.delete(
  // TODO endpoint: deprecate (moved to DELETE api/v3/secrets)
  "/",
  body("secretIds")
    .exists()
    .custom((value) => {
      // case: delete 1 secret
      if (typeof value === "string") return true;

      if (Array.isArray(value)) {
        // case: delete multiple secrets
        if (value.length === 0) throw new Error("secrets cannot be an empty array");
        return value.every((id: string) => typeof id === "string");
      }

      throw new Error("secretIds must be a string or an array of strings");
    })
    .not()
    .isEmpty(),
  validateRequest,
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN]
  }),
  requireSecretsAuth({
    acceptedRoles: [ADMIN, MEMBER],
    requiredPermissions: [PERMISSION_WRITE_SECRETS]
  }),
  secretsController.deleteSecrets
);

export default router;
