import express from "express";
const router = express.Router();
import {
  requireAuth,
  requireServiceTokenDataAuth,
  requireWorkspaceAuth,
  validateRequest
} from "../../middleware";
import { body, param } from "express-validator";
import {
  ADMIN,
  AuthMode,
  MEMBER,
  PERMISSION_WRITE_SECRETS
} from "../../variables";
import { serviceTokenDataController } from "../../controllers/v2";

router.get(
  "/",
  requireAuth({
    acceptedAuthModes: [AuthMode.SERVICE_TOKEN]
  }),
  serviceTokenDataController.getServiceTokenData
);

router.post(
  "/",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER],
    locationWorkspaceId: "body",
    locationEnvironment: "body",
    requiredPermissions: [PERMISSION_WRITE_SECRETS]
  }),
  body("name").exists().isString().trim(),
  body("workspaceId").exists().isString().trim(),
  body("scopes").exists().isArray(),
  body("scopes.*.environment").exists().isString().trim(),
  body("scopes.*.secretPath").exists().isString().trim(),
  body("encryptedKey").exists().isString().trim(),
  body("iv").exists().isString().trim(),
  body("tag").exists().isString().trim(),
  body("expiresIn").exists().isNumeric(), // measured in ms
  body("permissions")
    .isArray({ min: 1 })
    .custom((value: string[]) => {
      const allowedPermissions = ["read", "write"];
      const invalidValues = value.filter((v) => !allowedPermissions.includes(v));
      if (invalidValues.length > 0) {
        throw new Error(`permissions contains invalid values: ${invalidValues.join(", ")}`);
      }

      return true;
    }),
  validateRequest,
  serviceTokenDataController.createServiceTokenData
);

router.delete(
  "/:serviceTokenDataId",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  requireServiceTokenDataAuth({
    acceptedRoles: [ADMIN, MEMBER]
  }),
  param("serviceTokenDataId").exists().trim(),
  validateRequest,
  serviceTokenDataController.deleteServiceTokenData
);

export default router;
