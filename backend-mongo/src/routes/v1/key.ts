import express from "express";
const router = express.Router();
import { requireAuth } from "../../middleware";
import { AuthMode } from "../../variables";
import { keyController } from "../../controllers/v1";

// TODO endpoint: consider moving these endpoints to be under /workspaces to be more RESTful

router.post(
  "/:workspaceId",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  keyController.uploadKey
);

router.get(
  // TODO endpoint: deprecate (note: move frontend to v2/workspace/key or something)
  "/:workspaceId/latest",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  keyController.getLatestKey
);

export default router;
