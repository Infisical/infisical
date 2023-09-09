import express from "express";
const router = express.Router();
import { param } from "express-validator";
import { requireAuth, validateRequest } from "../../middleware";
import { membershipOrgController } from "../../controllers/v1";
import { AuthMode } from "../../variables";

router.post(
  // TODO endpoint: check dashboard
  "/membershipOrg/:membershipOrgId/change-role",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  param("membershipOrgId"),
  validateRequest,
  membershipOrgController.changeMembershipOrgRole
);

router.delete(
  "/:membershipOrgId", // TODO endpoint: check dashboard
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  membershipOrgController.deleteMembershipOrg
);

export default router;
