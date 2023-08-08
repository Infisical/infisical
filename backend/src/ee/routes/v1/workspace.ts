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
  AuthMode,
  MEMBER
} from "../../../variables";
import { workspaceController } from "../../controllers/v1";
import { EventType, UserAgentType } from "../../models";

router.get(
  "/:workspaceId/secret-snapshots",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY],
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
    acceptedAuthModes: [AuthMode.JWT],
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
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY],
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
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY],
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
  "/:workspaceId/audit-logs",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY],
  }),
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER],
    locationWorkspaceId: "params",
  }),
  param("workspaceId").exists().trim(),
  query("eventType").isString().isIn(Object.values(EventType)).optional({ nullable: true }),
  query("userAgentType").isString().isIn(Object.values(UserAgentType)).optional({ nullable: true }),
  query("actor").optional({ nullable: true }),
  query("startDate").isISO8601().withMessage("Invalid start date format").optional({ nullable: true }),
  query("endDate").isISO8601().withMessage("Invalid end date format").optional({ nullable: true }),
  query("offset"),
  query("limit"),
  validateRequest,
  workspaceController.getWorkspaceAuditLogs
);

router.get(
  "/:workspaceId/audit-logs/filters/actors",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY],
  }),
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER],
    locationWorkspaceId: "params",
  }),
  param("workspaceId").exists().trim(),
  validateRequest,
  workspaceController.getWorkspaceAuditLogActorFilterOpts
);

router.get(
  "/:workspaceId/trusted-ips",
  param("workspaceId").exists().isString().trim(),
  requireAuth({
      acceptedAuthModes: [AuthMode.JWT],
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
      acceptedAuthModes: [AuthMode.JWT],
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
      acceptedAuthModes: [AuthMode.JWT],
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
      acceptedAuthModes: [AuthMode.JWT],
  }),
  requireWorkspaceAuth({
      acceptedRoles: [ADMIN],
      locationWorkspaceId: "params",
  }),
  workspaceController.deleteWorkspaceTrustedIp
);

export default router;
