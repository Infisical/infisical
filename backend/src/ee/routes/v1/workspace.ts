import express from "express";
const router = express.Router();
import {
  requireAuth,
  requireWorkspaceAuth,
  validateRequest,
} from "../../../middleware";
import { body, param, query } from "express-validator";
import {
  ADMIN, 
  AUTH_MODE_API_KEY,
  AUTH_MODE_JWT,
  MEMBER
} from "../../../variables";
import { workspaceController } from "../../controllers/v1";

router.get(
  "/:workspaceId/secret-snapshots",
  requireAuth({
    acceptedAuthModes: [AUTH_MODE_JWT, AUTH_MODE_API_KEY],
  }),
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER],
    locationWorkspaceId: "params",
  }),
  param("workspaceId").exists().trim(),
  query("environment").isString().exists().trim(),
  query("folderId").default("root").isString().trim(),
  query("offset").exists().isInt(),
  query("limit").exists().isInt(),
  validateRequest,
  workspaceController.getWorkspaceSecretSnapshots
);

router.get(
  "/:workspaceId/secret-snapshots/count",
  requireAuth({
    acceptedAuthModes: [AUTH_MODE_JWT],
  }),
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER],
    locationWorkspaceId: "params",
  }),
  param("workspaceId").exists().trim(),
  query("environment").isString().exists().trim(),
  query("folderId").default("root").isString().trim(),
  validateRequest,
  workspaceController.getWorkspaceSecretSnapshotsCount
);

router.post(
  "/:workspaceId/secret-snapshots/rollback",
  requireAuth({
    acceptedAuthModes: [AUTH_MODE_JWT, AUTH_MODE_API_KEY],
  }),
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER],
    locationWorkspaceId: "params",
  }),
  param("workspaceId").exists().trim(),
  body("environment").isString().exists().trim(),
  query("folderId").default("root").isString().exists().trim(),
  body("version").exists().isInt(),
  validateRequest,
  workspaceController.rollbackWorkspaceSecretSnapshot
);

router.get(
  "/:workspaceId/logs",
  requireAuth({
    acceptedAuthModes: [AUTH_MODE_JWT, AUTH_MODE_API_KEY],
  }),
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER],
    locationWorkspaceId: "params",
  }),
  param("workspaceId").exists().trim(),
  query("offset").exists().isInt(),
  query("limit").exists().isInt(),
  query("sortBy"),
  query("userId"),
  query("actionNames"),
  validateRequest,
  workspaceController.getWorkspaceLogs
);

router.get(
  "/:workspaceId/trusted-ips",
  param("workspaceId").exists().isString().trim(),
  requireAuth({
      acceptedAuthModes: [AUTH_MODE_JWT],
  }),
  requireWorkspaceAuth({
      acceptedRoles: [ADMIN, MEMBER],
      locationWorkspaceId: "params",
  }),
  workspaceController.getWorkspaceTrustedIps
);

router.post(
  "/:workspaceId/trusted-ips",
  param("workspaceId").exists().isString().trim(),
  body("ipAddress").exists().isString().trim(),
  body("comment").default("").isString().trim(),
  body("isActive").exists().isBoolean(),
  validateRequest,
  requireAuth({
      acceptedAuthModes: [AUTH_MODE_JWT],
  }),
  requireWorkspaceAuth({
      acceptedRoles: [ADMIN],
      locationWorkspaceId: "params",
  }),
  workspaceController.addWorkspaceTrustedIp
);

router.patch(
  "/:workspaceId/trusted-ips/:trustedIpId",
  param("workspaceId").exists().isString().trim(),
  param("trustedIpId").exists().isString().trim(),
  body("ipAddress").isString().trim().default(""),
  body("comment").default("").isString().trim(),
  validateRequest,
  requireAuth({
      acceptedAuthModes: [AUTH_MODE_JWT],
  }),
  requireWorkspaceAuth({
      acceptedRoles: [ADMIN],
      locationWorkspaceId: "params",
  }),
  workspaceController.updateWorkspaceTrustedIp
);

router.delete(
  "/:workspaceId/trusted-ips/:trustedIpId",
  param("workspaceId").exists().isString().trim(),
  param("trustedIpId").exists().isString().trim(),
  validateRequest,
  requireAuth({
      acceptedAuthModes: [AUTH_MODE_JWT],
  }),
  requireWorkspaceAuth({
      acceptedRoles: [ADMIN],
      locationWorkspaceId: "params",
  }),
  workspaceController.deleteWorkspaceTrustedIp
);

export default router;
