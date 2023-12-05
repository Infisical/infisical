import express from "express";
const router = express.Router();
import { requireAuth } from "../../../middleware";
import { AuthMode } from "../../../variables";
import { machineIdentityController } from "../../controllers/v3";

router.get(
  "/:machineId/client-secrets",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  machineIdentityController.getMIClientSecrets
);

router.post(
  "/:machineId/client-secrets",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  machineIdentityController.createMIClientSecret
);

router.delete(
  "/:machineId/client-secrets/:clientSecretId",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  machineIdentityController.deleteMIClientSecret
);

// consider moving to /auth/machine/login
router.post(
  "/login",
  machineIdentityController.loginMI
);

router.post(
  "/",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.MACHINE_ACCESS_TOKEN]
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