import express from "express";
const router = express.Router();
import { requireAuth } from "@app/middleware";
import { botController } from "@app/controllers/v1";
import { AuthMode } from "@app/variables";

router.get(
  "/:workspaceId",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  botController.getBotByWorkspaceId
);

router.patch(
  "/:botId/active",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  botController.setBotActiveState
);

export default router;
