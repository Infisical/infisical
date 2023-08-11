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

// TODO endpoint: consider moving these endpoints to be under /workspaces to be more RESTful

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

router.get( // TODO endpoint: deprecate (note: move frontend to v2/workspace/key or something)
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
