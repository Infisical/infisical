import express from "express";
const router = express.Router();
import { requireAuth } from "../../middleware";
import { mfaController } from "../../controllers/v3";
import { AuthMode } from "../../variables";

// email

router.post(
  "/email/enable",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY]
  }),
  mfaController.enableMfaEmail
);

router.post(
  "/email/disable",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY]
  }),
  mfaController.disableMfaEmail
);

// authenticator app

router.post(
  "/auth-app/enable1",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY]
  }),
  mfaController.enableAuthAppMfaStep1
);

router.post(
  "/auth-app/enable2",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY]
  }),
  mfaController.enableAuthAppMfaStep2
);

router.post(
  "/auth-app/disable",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY]
  }),
  mfaController.disableMfaAuthApp
);

// recovery codes

router.put(
  "/recovery-codes/create",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY]
  }),
  mfaController.createNewMfaRecoveryCodes
);

router.get(
  "/recovery-codes/show",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY]
  }),
  mfaController.showMfaRecoveryCodes
);

// all

router.put(
  "/update-preference",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY]
  }),
  mfaController.updateMfaPreference
);

router.post(
  "/disable-all",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY]
  }),
  mfaController.disableMfaAll
);

export default router;