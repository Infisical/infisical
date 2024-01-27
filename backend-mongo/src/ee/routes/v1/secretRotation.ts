import express from "express";

import { AuthMode } from "../../../variables";
import { requireAuth } from "../../../middleware";
import { secretRotationController } from "../../controllers/v1";

const router = express.Router();

router.post(
  "/",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  secretRotationController.createSecretRotation
);

router.post(
  "/restart",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  secretRotationController.restartSecretRotations
);

router.get(
  "/",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  secretRotationController.getSecretRotations
);

router.delete(
  "/:id",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  secretRotationController.deleteSecretRotations
);

export default router;
