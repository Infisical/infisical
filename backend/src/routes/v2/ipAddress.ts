import express from "express";
import {
  requireAuth,
  requireWorkspaceAuth,
  validateRequest,
} from "../../middleware";
import { ADMIN, AUTH_MODE_JWT, MEMBER } from "../../variables";
import {body, param} from "express-validator";
import * as ipAddressController from "../../controllers/v2/ipAdressController";

const router = express.Router();

router.get(
  "/:workspaceId/ips",
  requireAuth({
    acceptedAuthModes: [AUTH_MODE_JWT],
  }),
  requireWorkspaceAuth({
    acceptedRoles: [MEMBER, ADMIN],
    locationWorkspaceId: "params",
  }),
  param("workspaceId").exists().trim(),
  validateRequest,
  ipAddressController.getWorkspaceIpAddress
);


router.delete(
    "/:workspaceId/ips/:ipId",
    requireAuth({
      acceptedAuthModes: [AUTH_MODE_JWT],
    }),
    requireWorkspaceAuth({
      acceptedRoles: [MEMBER, ADMIN],
      locationWorkspaceId: "params",
    }),
    param("workspaceId").exists().trim(),
    validateRequest,
    ipAddressController.deleteWorkSpaceIpAddress
);

router.post(
    "/:workspaceId/ips",
    requireAuth({
      acceptedAuthModes: [AUTH_MODE_JWT],
    }),
    requireWorkspaceAuth({
      acceptedRoles: [MEMBER, ADMIN],
      locationWorkspaceId: "params",
    }),
    param("workspaceId").exists().trim(),
    body('ip').exists().trim(),
    validateRequest,
    ipAddressController.createWorkspaceIpAddress
);

export default router;
