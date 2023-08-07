import express from "express";
const router = express.Router();
import {
	requireAuth,
	requireWorkspaceAuth,
	validateRequest,
} from "../../middleware";
import { body, param } from "express-validator";
import { ADMIN, AuthMode, MEMBER } from "../../variables";
import { keyController } from "../../controllers/v1";

router.post(
	"/:workspaceId",
	requireAuth({
        acceptedAuthModes: [AuthMode.JWT],
    }),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER],
		locationWorkspaceId: "params",
	}),
	param("workspaceId").exists().trim(),
	body("key").exists(),
	validateRequest,
	keyController.uploadKey
);

router.get(
	"/:workspaceId/latest",
	requireAuth({
        acceptedAuthModes: [AuthMode.JWT],
    }),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER],
		locationWorkspaceId: "params",
	}),
	param("workspaceId"),
	validateRequest,
	keyController.getLatestKey
);

export default router;
