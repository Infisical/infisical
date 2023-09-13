import express from "express";
const router = express.Router();
import { tagController } from "@app/controllers/v2";
import { requireAuth } from "@app/middleware";
import { AuthMode } from "@app/variables";

router.get(
  "/:workspaceId/tags",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  tagController.getWorkspaceTags
);

router.delete(
  "/tags/:tagId",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  tagController.deleteWorkspaceTag
);

router.post(
  "/:workspaceId/tags",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  tagController.createWorkspaceTag
);

export default router;
