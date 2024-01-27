import express from "express";
const router = express.Router();
import { requireAuth } from "../../middleware";
import { AuthMode } from "../../variables";
import { webhookController } from "../../controllers/v1";

router.post(
  "/",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  webhookController.createWebhook
);

router.patch(
  "/:webhookId",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  webhookController.updateWebhook
);

router.post(
  "/:webhookId/test",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  webhookController.testWebhook
);

router.delete(
  "/:webhookId",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  webhookController.deleteWebhook
);

router.get(
  "/",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  webhookController.listWebhooks
);

export default router;
