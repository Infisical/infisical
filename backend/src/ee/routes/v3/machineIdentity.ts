import express from "express";
const router = express.Router();
import { requireAuth } from "../../../middleware";
import { AuthMode } from "../../../variables";
import { machineIdentityController } from "../../controllers/v3";

router.post(
  "/me/token",
  machineIdentityController.refreshToken
);

router.post(
  "/",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  machineIdentityController.createMachineIdentity
);

router.patch(
  "/:machineId",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  machineIdentityController.updateMachineIdentity
);

router.delete(
  "/:machineId",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  machineIdentityController.deleteMachineIdentity
);

export default router;