import express from "express";
const router = express.Router();
import {
  requireAuth,
  requireWorkspaceAuth,
  validateRequest,
} from "../../../middleware";
import { body, param, query } from "express-validator";
import { ADMIN, MEMBER } from "../../../variables";
import { workspaceController } from "../../controllers/v1";

router.get(
  "/:workspaceId/secret-snapshots",
  requireAuth({
    acceptedAuthModes: ["jwt", "apiKey"],
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
    acceptedAuthModes: ["jwt"],
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
    acceptedAuthModes: ["jwt", "apiKey"],
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
    acceptedAuthModes: ["jwt", "apiKey"],
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

export default router;
