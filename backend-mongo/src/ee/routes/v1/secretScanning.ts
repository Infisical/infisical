import express from "express";
const router = express.Router();
import { requireAuth } from "../../../middleware";
import {
  createInstallationSession,
  getCurrentOrganizationInstallationStatus,
  getRisksForOrganization,
  linkInstallationToOrganization,
  updateRisksStatus
} from "../../../controllers/v1/secretScanningController";
import { AuthMode } from "../../../variables";

router.post(
  "/create-installation-session/organization/:organizationId",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  createInstallationSession
);

router.post(
  "/link-installation",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  linkInstallationToOrganization
);

router.get(
  "/installation-status/organization/:organizationId",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  getCurrentOrganizationInstallationStatus
);

router.get(
  "/organization/:organizationId/risks",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  getRisksForOrganization
);

router.post(
  "/organization/:organizationId/risks/:riskId/status",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  updateRisksStatus
);

export default router;
