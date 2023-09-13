import express from "express";
const router = express.Router();
import { requireAuth } from "@app/middleware";
import { secretController } from "@app/ee/controllers/v1";
import { AuthMode } from "@app/variables";

router.get(
  "/:secretId/secret-versions",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY]
  }),
  secretController.getSecretVersions
);

router.post(
  "/:secretId/secret-versions/rollback",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY]
  }),
  secretController.rollbackSecretVersion
);

export default router;
