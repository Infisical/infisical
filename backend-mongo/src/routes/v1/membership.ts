import express from "express";
const router = express.Router();
import { requireAuth } from "../../middleware";
import { membershipController } from "../../controllers/v1";
import { AuthMode } from "../../variables";

// note: ALL DEPRECIATED (moved to api/v2/workspace/:workspaceId/memberships/:membershipId)
// TODO endpoint: consider moving these endpoints to be under /workspace to be more RESTful

router.get(
  // TODO endpoint: deprecate - used for old CLI (deprecate)
  "/:workspaceId/connect",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  membershipController.validateMembership
);

router.delete(
  // TODO endpoint: check dashboard
  "/:membershipId",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  membershipController.deleteMembership
);

router.post(
  // TODO endpoint: check dashboard
  "/:membershipId/change-role",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  membershipController.changeMembershipRole
);

export default router;
