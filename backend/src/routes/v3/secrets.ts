import express from "express";
import { requireAuth, requireBlindIndicesEnabled, requireE2EEOff } from "../../middleware";
import { secretsController, reminderController } from "../../controllers/v3";
import { AuthMode } from "../../variables";

const router = express.Router();

router.get(
  "/raw",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN, AuthMode.SERVICE_TOKEN_V3]
  }),
  secretsController.getSecretsRaw
);

router.get(
  "/raw/:secretName",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN, AuthMode.SERVICE_TOKEN_V3]
  }),
  requireBlindIndicesEnabled({
    locationWorkspaceId: "query"
  }),
  requireE2EEOff({
    locationWorkspaceId: "query"
  }),
  secretsController.getSecretByNameRaw
);

router.post(
  "/raw/:secretName",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN, AuthMode.SERVICE_TOKEN_V3]
  }),
  requireBlindIndicesEnabled({
    locationWorkspaceId: "body"
  }),
  requireE2EEOff({
    locationWorkspaceId: "body"
  }),
  secretsController.createSecretRaw
);

router.patch(
  "/raw/:secretName",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN, AuthMode.SERVICE_TOKEN_V3]
  }),
  requireBlindIndicesEnabled({
    locationWorkspaceId: "body"
  }),
  requireE2EEOff({
    locationWorkspaceId: "body"
  }),
  secretsController.updateSecretByNameRaw
);

router.delete(
  "/raw/:secretName",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN, AuthMode.SERVICE_TOKEN_V3]
  }),
  requireBlindIndicesEnabled({
    locationWorkspaceId: "body"
  }),
  requireE2EEOff({
    locationWorkspaceId: "body"
  }),
  secretsController.deleteSecretByNameRaw
);

router.get(
  "/",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN, AuthMode.SERVICE_TOKEN_V3]
  }),
  requireBlindIndicesEnabled({
    locationWorkspaceId: "query"
  }),
  secretsController.getSecrets
);

// akhilmhdh: dont put batch router below the individual operation as those have arbitory name as params
router.post(
  "/batch",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN]
  }),
  requireBlindIndicesEnabled({
    locationWorkspaceId: "body"
  }),
  secretsController.createSecretByNameBatch
);

router.patch(
  "/batch",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN]
  }),
  requireBlindIndicesEnabled({
    locationWorkspaceId: "body"
  }),
  secretsController.updateSecretByNameBatch
);

router.delete(
  "/batch",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN]
  }),
  requireBlindIndicesEnabled({
    locationWorkspaceId: "body"
  }),
  secretsController.deleteSecretByNameBatch
);

router.post(
  "/:secretName",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN, AuthMode.SERVICE_TOKEN_V3]
  }),
  requireBlindIndicesEnabled({
    locationWorkspaceId: "body"
  }),
  secretsController.createSecret
);

router.get(
  "/:secretName",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN, AuthMode.SERVICE_TOKEN_V3]
  }),
  requireBlindIndicesEnabled({
    locationWorkspaceId: "query"
  }),
  secretsController.getSecretByName
);

router.patch(
  "/:secretName",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN, AuthMode.SERVICE_TOKEN_V3]
  }),
  requireBlindIndicesEnabled({
    locationWorkspaceId: "body"
  }),
  secretsController.updateSecretByName
);

router.delete(
  "/:secretName",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN, AuthMode.SERVICE_TOKEN_V3]
  }),
  requireBlindIndicesEnabled({
    locationWorkspaceId: "body"
  }),
  secretsController.deleteSecretByName
);

router.get(
  "/:secretID/reminders/",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN, AuthMode.SERVICE_TOKEN_V3]
  }),
  reminderController.getSecretReminders
);

router.post(
  "/:secretID/reminders/",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN, AuthMode.SERVICE_TOKEN_V3]
  }),
  reminderController.createSecretReminders
);

router.patch(
  "/:secretID/reminders/:reminderID",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN, AuthMode.SERVICE_TOKEN_V3]
  }),
  reminderController.updateSecretReminders
);

router.delete(
  "/:secretID/reminders/:reminderID",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN, AuthMode.SERVICE_TOKEN_V3]
  }),
  reminderController.deleteSecretReminders
);

export default router;