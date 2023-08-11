import express from "express";
const router = express.Router();
import {
	requireAuth,
	requireServiceTokenAuth,
	requireWorkspaceAuth,
	validateRequest,
} from "../../middleware";
import { body, param, query } from "express-validator";
import { secretController } from "../../controllers/v1";
import {
	ADMIN, 
	AuthMode,
	MEMBER
} from "../../variables";

// note: endpoints deprecated in favor of v3/secrets

router.post( // TODO endpoint: deprecate (moved to POST api/v3/secrets)
	"/:workspaceId",
	requireAuth({
		acceptedAuthModes: [AuthMode.JWT],
	}),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER],
		locationWorkspaceId: "params",
	}),
	body("secrets").exists(),
	body("keys").exists(),
	body("environment").exists().trim().notEmpty(),
	body("channel"),
	param("workspaceId").exists().trim(),
	validateRequest,
	secretController.pushSecrets
);

router.get( // TODO endpoint: deprecate (moved to GET api/v3/secrets)
	"/:workspaceId",
	requireAuth({
		acceptedAuthModes: [AuthMode.JWT],
	}),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER],
		locationWorkspaceId: "params",
	}),
	query("environment").exists().trim(),
	query("channel"),
	param("workspaceId").exists().trim(),
	validateRequest,
	secretController.pullSecrets
);

router.get( // TODO endpoint: deprecate (moved to GET api/v3/secrets)
	"/:workspaceId/service-token",
	requireServiceTokenAuth,
	query("environment").exists().trim(),
	query("channel"),
	param("workspaceId").exists().trim(),
	validateRequest,
	secretController.pullSecretsServiceToken
);

export default router;
