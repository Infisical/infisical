import express from "express";
const router = express.Router();
import { param } from "express-validator";
import { requireAuth, validateRequest } from "../../middleware";
import { membershipOrgController } from "../../controllers/v1";
import { AuthMode } from "../../variables";

router.post(
	// TODO
	"/membershipOrg/:membershipOrgId/change-role",
	requireAuth({
		acceptedAuthModes: [AuthMode.JWT],
	}),
	param("membershipOrgId"),
	validateRequest,
	membershipOrgController.changeMembershipOrgRole
);

router.delete(
	"/:membershipOrgId",
	requireAuth({
		acceptedAuthModes: [AuthMode.JWT],
	}),
	param("membershipOrgId").exists().trim(),
	validateRequest,
	membershipOrgController.deleteMembershipOrg
);

export default router;
