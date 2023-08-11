import express from "express";
const router = express.Router();
import { body, param } from "express-validator";
import { requireAuth, validateRequest } from "../../middleware";
import { membershipController } from "../../controllers/v1";
import { membershipController as EEMembershipControllers } from "../../ee/controllers/v1";
import { AuthMode } from "../../variables";

// note: ALL DEPRECIATED (moved to api/v2/workspace/:workspaceId/memberships/:membershipId)
// TODO endpoint: consider moving these endpoints to be under /workspace to be more RESTful

router.get( // TODO endpoint: deprecate - used for old CLI (deprecate)
	"/:workspaceId/connect",
	requireAuth({
		acceptedAuthModes: [AuthMode.JWT],
	}),
	param("workspaceId").exists().trim(),
	validateRequest,
	membershipController.validateMembership
);

router.delete( // TODO endpoint: check dashboard
	"/:membershipId",
	requireAuth({
		acceptedAuthModes: [AuthMode.JWT],
	}),
	param("membershipId").exists().trim(),
	validateRequest,
	membershipController.deleteMembership
);

router.post( // TODO endpoint: check dashboard
	"/:membershipId/change-role",
	requireAuth({
		acceptedAuthModes: [AuthMode.JWT],
	}),
	body("role").exists().trim(),
	validateRequest,
	membershipController.changeMembershipRole
);

router.post( // TODO endpoint: check dashboard
	"/:membershipId/deny-permissions",
	requireAuth({
		acceptedAuthModes: [AuthMode.JWT],
	}),
	param("membershipId").isMongoId().exists().trim(),
	body("permissions").isArray().exists(),
	validateRequest,
	EEMembershipControllers.denyMembershipPermissions
);

export default router;
