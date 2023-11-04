import express from "express";

import { AuthMode } from "../../../variables";
import { requireAuth } from "../../../middleware";
import { secretRotationProviderController } from "../../controllers/v1";

const router = express.Router();

router.get(
  "/:workspaceId",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  secretRotationProviderController.getProviderTemplates
);

export default router;
