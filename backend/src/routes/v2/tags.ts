import express from "express";
const router = express.Router();
import { body, param } from "express-validator";
import { tagController } from "../../controllers/v2";
import {
  requireAuth,
  requireWorkspaceAuth,
  validateRequest,
} from "../../middleware";
import { 
  ADMIN, 
  AuthMode,
  MEMBER
} from "../../variables";

router.get(
  "/:workspaceId/tags",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT],
  }),
  requireWorkspaceAuth({
    acceptedRoles: [MEMBER, ADMIN],
    locationWorkspaceId: "params",
  }),
  param("workspaceId").exists().trim(),
  validateRequest,
  tagController.getWorkspaceTags
);

router.delete(
  "/tags/:tagId",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT],
  }),
  param("tagId").exists().trim(),
  validateRequest,
  tagController.deleteWorkspaceTag
);

router.post(
  "/:workspaceId/tags",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT],
  }),
  requireWorkspaceAuth({
    acceptedRoles: [MEMBER, ADMIN],
    locationWorkspaceId: "params",
  }),
  param("workspaceId").exists().trim(),
  body("name").exists().trim(),
  body("tagColor").exists().trim(),
  body("slug").exists().trim(),
  validateRequest,
  tagController.createWorkspaceTag
);

export default router;
