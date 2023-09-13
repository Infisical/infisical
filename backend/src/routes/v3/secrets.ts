import express from "express";
const router = express.Router();
import { requireAuth, requireBlindIndicesEnabled, requireE2EEOff } from "@app/middleware";
import { secretsController } from "@app/controllers/v3";
import { AuthMode } from "@app/variables";

router.get(
  "/raw",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN]
  }),
  secretsController.getSecretsRaw
);

router.get(
  "/raw/:secretName",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN]
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
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN]
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
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN]
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
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN]
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
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN]
  }),
  requireBlindIndicesEnabled({
    locationWorkspaceId: "query"
  }),
  secretsController.getSecrets
);

router.post(
  "/:secretName",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN]
  }),
  requireBlindIndicesEnabled({
    locationWorkspaceId: "body"
  }),
  secretsController.createSecret
);

router.get(
  "/:secretName",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN]
  }),
  requireBlindIndicesEnabled({
    locationWorkspaceId: "query"
  }),
  secretsController.getSecretByName
);

router.patch(
  "/:secretName",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN]
  }),
  requireBlindIndicesEnabled({
    locationWorkspaceId: "body"
  }),
  secretsController.updateSecretByName
);

router.delete(
  "/:secretName",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN]
  }),
  requireBlindIndicesEnabled({
    locationWorkspaceId: "body"
  }),
  secretsController.deleteSecretByName
);

export default router;
