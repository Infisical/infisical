import express from "express";
const router = express.Router();
import { body, param } from "express-validator";
import {
	requireAuth,
	requireWorkspaceAuth,
	validateRequest,
} from "../../middleware";
import {
	ADMIN, 
	MEMBER,
	AuthMode
} from "../../variables";
import { membershipController, workspaceController } from "../../controllers/v1";

router.get(
	"/:workspaceId/keys",
	requireAuth({
		acceptedAuthModes: [AuthMode.JWT],
	}),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER],
		locationWorkspaceId: "params",
	}),
	param("workspaceId").exists().trim(),
	validateRequest,
	workspaceController.getWorkspacePublicKeys
);

router.get(
	"/:workspaceId/users",
	requireAuth({
		acceptedAuthModes: [AuthMode.JWT],
	}),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER],
		locationWorkspaceId: "params",
	}),
	param("workspaceId").exists().trim(),
	validateRequest,
	workspaceController.getWorkspaceMemberships
);

router.get(
	"/", 
	requireAuth({
		acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY],
	}), 
	workspaceController.getWorkspaces
);

router.get(
	"/:workspaceId",
	requireAuth({
		acceptedAuthModes: [AuthMode.JWT],
	}),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER],
		locationWorkspaceId: "params",
	}),
	param("workspaceId").exists().trim(),
	validateRequest,
	workspaceController.getWorkspace
);

router.post(
	"/",
	requireAuth({
		acceptedAuthModes: [AuthMode.JWT],
	}),
	body("workspaceName").exists().trim().notEmpty(),
	body("organizationId").exists().trim().notEmpty(),
	validateRequest,
	workspaceController.createWorkspace
);

router.delete(
	"/:workspaceId",
	requireAuth({
		acceptedAuthModes: [AuthMode.JWT],
	}),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN],
		locationWorkspaceId: "params",
	}),
	param("workspaceId").exists().trim(),
	validateRequest,
	workspaceController.deleteWorkspace
);

router.post(
	"/:workspaceId/name",
	requireAuth({
		acceptedAuthModes: [AuthMode.JWT],
	}),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER],
		locationWorkspaceId: "params",
	}),
	param("workspaceId").exists().trim(),
	body("name").exists().trim().notEmpty(),
	validateRequest,
	workspaceController.changeWorkspaceName
);

router.post(
	"/:workspaceId/invite-signup",
	requireAuth({
		acceptedAuthModes: [AuthMode.JWT],
	}),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER],
		locationWorkspaceId: "params",
	}),
	param("workspaceId").exists().trim(),
	body("email").exists().trim().notEmpty(),
	validateRequest,
	membershipController.inviteUserToWorkspace
);

router.get(
	"/:workspaceId/integrations",
	requireAuth({
		acceptedAuthModes: [AuthMode.JWT],
	}),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER],
		locationWorkspaceId: "params",
	}),
	param("workspaceId").exists().trim(),
	validateRequest,
	workspaceController.getWorkspaceIntegrations
);

router.get(
	"/:workspaceId/authorizations",
	requireAuth({
		acceptedAuthModes: [AuthMode.JWT],
	}),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER],
		locationWorkspaceId: "params",
	}),
	param("workspaceId").exists().trim(),
	validateRequest,
	workspaceController.getWorkspaceIntegrationAuthorizations
);

router.get(
	"/:workspaceId/service-tokens", // deprecate
	requireAuth({
		acceptedAuthModes: [AuthMode.JWT],
	}),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER],
		locationWorkspaceId: "params",
	}),
	param("workspaceId").exists().trim(),
	validateRequest,
	workspaceController.getWorkspaceServiceTokens
);

export default router;
