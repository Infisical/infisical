import express from "express";
const router = express.Router();
import { requireAuth, validateRequest } from "../../middleware";
import { body, query } from "express-validator";
import { userActionController } from "../../controllers/v1";
import { AuthMode } from "../../variables";

// note: [userAction] will be deprecated in /v2 in favor of [action]
router.post( // TODO endpoint: move this into /users/me
	"/",
	requireAuth({
		acceptedAuthModes: [AuthMode.JWT],
	}),
	body("action"),
	validateRequest,
	userActionController.addUserAction
);

router.get(
	"/",
	requireAuth({
		acceptedAuthModes: [AuthMode.JWT],
	}),
	query("action"),
	validateRequest,
	userActionController.getUserAction
);

export default router;
