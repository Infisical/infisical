import express from "express";
const router = express.Router();
import {
  requireAuth,
  requireOrganizationAuth,
  validateRequest,
} from "../../../middleware";
import { body, param } from "express-validator";
import { createInstallationSession, getCurrentOrganizationInstallationStatus, getRisksForOrganization, linkInstallationToOrganization, updateRisksStatus } from "../../../controllers/v1/secretScanningController";
import { ACCEPTED, ADMIN, AuthMode, MEMBER, OWNER } from "../../../variables";

router.post(
  "/create-installation-session/organization/:organizationId",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT],
  }),
  param("organizationId").exists().trim(),
  requireOrganizationAuth({
    acceptedRoles: [OWNER, ADMIN, MEMBER],
    acceptedStatuses: [ACCEPTED],
  }),
  validateRequest,
  createInstallationSession
);

router.post(
  "/link-installation",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT],
  }),
  body("installationId").exists().trim(),
  body("sessionId").exists().trim(),
  validateRequest,
  linkInstallationToOrganization
);

router.get(
  "/installation-status/organization/:organizationId",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT],
  }),
  param("organizationId").exists().trim(),
  requireOrganizationAuth({
    acceptedRoles: [OWNER, ADMIN, MEMBER],
    acceptedStatuses: [ACCEPTED],
  }),
  validateRequest,
  getCurrentOrganizationInstallationStatus
);

router.get(
  "/organization/:organizationId/risks",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT],
  }),
  param("organizationId").exists().trim(),
  requireOrganizationAuth({
    acceptedRoles: [OWNER, ADMIN, MEMBER],
    acceptedStatuses: [ACCEPTED],
  }),
  validateRequest,
  getRisksForOrganization
);

router.post(
  "/organization/:organizationId/risks/:riskId/status",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT],
  }),
  param("organizationId").exists().trim(),
  param("riskId").exists().trim(),
  body("status").exists(),
  requireOrganizationAuth({
    acceptedRoles: [OWNER, ADMIN, MEMBER],
    acceptedStatuses: [ACCEPTED],
  }),
  validateRequest,
  updateRisksStatus
);

export default router;