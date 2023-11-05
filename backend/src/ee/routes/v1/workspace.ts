import express from "express";
const router = express.Router();
import { requireAuth } from "../../../middleware";
import { AuthMode } from "../../../variables";
import { workspaceController } from "../../controllers/v1";

router.get(
  "/:workspaceId/secret-snapshots",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY]
  }),
  workspaceController.getWorkspaceSecretSnapshots
);

router.get(
  "/:workspaceId/secret-snapshots/count",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  workspaceController.getWorkspaceSecretSnapshotsCount
);

router.post(
  "/:workspaceId/secret-snapshots/rollback",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY]
  }),
  workspaceController.rollbackWorkspaceSecretSnapshot
);

router.get(
  "/:workspaceId/audit-logs",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY]
  }),
  workspaceController.getWorkspaceAuditLogs
);

router.get(
  "/:workspaceId/audit-logs/filters/actors",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY]
  }),
  workspaceController.getWorkspaceAuditLogActorFilterOpts
);

router.get(
  "/:workspaceId/trusted-ips",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  workspaceController.getWorkspaceTrustedIps
);

router.post(
  "/:workspaceId/trusted-ips",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  workspaceController.addWorkspaceTrustedIp
);

router.patch(
  "/:workspaceId/trusted-ips/:trustedIpId",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  workspaceController.updateWorkspaceTrustedIp
);

router.delete(
  "/:workspaceId/trusted-ips/:trustedIpId",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  workspaceController.deleteWorkspaceTrustedIp
);

export default router;
