import express from "express";
const router = express.Router();
import { requireAuth } from "../../../middleware";
import { AuthMode } from "../../../variables";
import { machineIdentitiesController } from "../../controllers/v1";

router.get(
  "/:machineId/client-secrets",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  machineIdentitiesController.getMIClientSecrets
);

router.post(
  "/:machineId/client-secrets",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  machineIdentitiesController.createMIClientSecret
);

router.delete(
  "/:machineId/client-secrets/:clientSecretId",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  machineIdentitiesController.deleteMIClientSecret
);

router.post(
  "/login",
  machineIdentitiesController.loginMI
);

// note: currently this is machine-identity specific
router.post(
  "/access-token/renew",
  machineIdentitiesController.renewAccessToken
);

router.post(
  "/",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.MACHINE_ACCESS_TOKEN]
  }),
  machineIdentitiesController.createMachineIdentity
);

router.patch(
  "/:machineId",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  machineIdentitiesController.updateMachineIdentity
);

router.delete(
  "/:machineId",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  machineIdentitiesController.deleteMachineIdentity
);

export default router;