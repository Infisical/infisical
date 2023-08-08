import express from "express";
const router = express.Router();
import { requireAuth, requireWorkspaceAuth, validateRequest } from "../../middleware";
import { body, param, query } from "express-validator";
import { ADMIN, AuthMode, MEMBER } from "../../variables";
import { webhookController } from "../../controllers/v1";

router.post(
  "/",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT],
  }),
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER],
    locationWorkspaceId: "body",
    locationEnvironment: "body"
  }),
  body("workspaceId").exists().isString().trim(),
  body("environment").exists().isString().trim(),
  body("webhookUrl").exists().isString().isURL().trim(),
  body("webhookSecretKey").isString().trim(),
  body("secretPath").default("/").isString().trim(),
  validateRequest,
  webhookController.createWebhook
);

router.patch(
  "/:webhookId",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT],
  }),
  param("webhookId").exists().isString().trim(),
  body("isDisabled").default(false).isBoolean(),
  validateRequest,
  webhookController.updateWebhook
);

router.post(
  "/:webhookId/test",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT],
  }),
  param("webhookId").exists().isString().trim(),
  validateRequest,
  webhookController.testWebhook
);

router.delete(
  "/:webhookId",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT],
  }),
  param("webhookId").exists().isString().trim(),
  validateRequest,
  webhookController.deleteWebhook
);

router.get(
  "/",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT],
  }),
  requireWorkspaceAuth({
    acceptedRoles: [ADMIN, MEMBER],
    locationWorkspaceId: "query",
    locationEnvironment: "query"
  }),
  query("workspaceId").exists().isString().trim(),
  query("environment").optional().isString().trim(),
  query("secretPath").optional().isString().trim(),
  validateRequest,
  webhookController.listWebhooks
);

export default router;
