import express from "express";
const router = express.Router();
import {
	requireAuth,
	requireServiceTokenAuth,
	requireWorkspaceAuth,
	validateRequest,
} from "../../middleware";
import { body } from "express-validator";
import {
	ADMIN, 
	AuthMode,
	MEMBER
} from "../../variables";
import { serviceTokenController } from "../../controllers/v1";

// note: deprecate service-token routes in favor of service-token data routes/structure

router.get( // TODO endpoint: deprecate
	"/",
	requireServiceTokenAuth,
	serviceTokenController.getServiceToken
);

router.post( // TODO endpoint: deprecate
	"/",
	requireAuth({
		acceptedAuthModes: [AuthMode.JWT],
	}),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER],
		locationWorkspaceId: "body",
	}),
	body("name").exists().trim().notEmpty(),
	body("workspaceId").exists().trim().notEmpty(),
	body("environment").exists().trim().notEmpty(),
	body("expiresIn"), // measured in ms
	body("publicKey").exists().trim().notEmpty(),
	body("encryptedKey").exists().trim().notEmpty(),
	body("nonce").exists().trim().notEmpty(),
	validateRequest,
	serviceTokenController.createServiceToken
);

export default router;
