import express from "express";
const router = express.Router();
import { requireAuth } from "../../middleware";
import { AuthMode } from "../../variables";
import { integrationController } from "../../controllers/v1";

router.post(
  "/",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY]
  }),
  integrationController.createIntegration
);

router.patch(
  "/:integrationId",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  integrationController.updateIntegration
);

router.delete(
  "/:integrationId",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  integrationController.deleteIntegration
);

router.post(
  "/manual-sync",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  integrationController.manualSync
);

export default router;