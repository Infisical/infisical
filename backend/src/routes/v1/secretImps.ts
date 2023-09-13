import express from "express";
const router = express.Router();
import { requireAuth } from "@app/middleware";
import { secretImpsController } from "@app/controllers/v1";
import { AuthMode } from "@app/variables";

router.post(
  "/",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.SERVICE_TOKEN]
  }),
  secretImpsController.createSecretImp
);

router.put(
  "/:id",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.SERVICE_TOKEN]
  }),
  secretImpsController.updateSecretImport
);

router.delete(
  "/:id",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.SERVICE_TOKEN]
  }),
  secretImpsController.deleteSecretImport
);

router.get(
  "/",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.SERVICE_TOKEN]
  }),
  secretImpsController.getSecretImports
);

router.get(
  "/secrets",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.SERVICE_TOKEN]
  }),
  secretImpsController.getAllSecretsFromImport
);

export default router;
