import express from "express";
const router = express.Router();
import { body, param, query } from "express-validator";
import {
	requireAuth,
	requireMembershipAuth,
	requireWorkspaceAuth,
	validateRequest,
} from "../../middleware";
import {
	ADMIN, 
	AuthMode,
	MEMBER
} from "../../variables";
import { workspaceController } from "../../controllers/v2";

router.post( // TODO endpoint: deprecate (moved to POST v3/secrets)
	"/:workspaceId/secrets",
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
	workspaceController.pushWorkspaceSecrets
);

router.get( // TODO endpoint: deprecate (moved to GET v3/secrets)
	"/:workspaceId/secrets",
	requireAuth({
		acceptedAuthModes: [AuthMode.JWT, AuthMode.SERVICE_TOKEN],
	}),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER],
		locationWorkspaceId: "params",
	}),
	query("environment").exists().trim(),
	query("channel"),
	param("workspaceId").exists().trim(),
	validateRequest,
	workspaceController.pullSecrets
);

router.get( // TODO endpoint: consider moving to v3/users/me/workspaces/:workspaceId/key
	"/:workspaceId/encrypted-key",
	requireAuth({
		acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY],
	}),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER],
		locationWorkspaceId: "params",
	}),
	param("workspaceId").exists().trim(),
	validateRequest,
	workspaceController.getWorkspaceKey
);

router.get(
	"/:workspaceId/service-token-data",
	requireAuth({
		acceptedAuthModes: [AuthMode.JWT],
	}),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER],
		locationWorkspaceId: "params",
	}),
	param("workspaceId").exists().trim(),
	validateRequest,
	workspaceController.getWorkspaceServiceTokenData
);

router.get( // new - TODO: rewire dashboard to this route
	"/:workspaceId/memberships",
	param("workspaceId").exists().trim(),
	validateRequest,
	requireAuth({
		acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY],
	}),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER],
		locationWorkspaceId: "params",
	}),
	workspaceController.getWorkspaceMemberships
);

router.patch( // TODO - rewire dashboard to this route
	"/:workspaceId/memberships/:membershipId",
	param("workspaceId").exists().trim(),
	param("membershipId").exists().trim(),
	body("role").exists().isString().trim().isIn([ADMIN, MEMBER]),
	validateRequest,
	requireAuth({
        acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY],
    }),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN],
		locationWorkspaceId: "params",
	}),
	requireMembershipAuth({
		acceptedRoles: [ADMIN],
		locationMembershipId: "params",
	}),
	workspaceController.updateWorkspaceMembership
);

router.delete( // TODO - rewire dashboard to this route
	"/:workspaceId/memberships/:membershipId",
	param("workspaceId").exists().trim(),
	param("membershipId").exists().trim(),
	validateRequest,
	requireAuth({
        acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY],
    }),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN],
		locationWorkspaceId: "params",
	}),
	requireMembershipAuth({
		acceptedRoles: [ADMIN],
		locationMembershipId: "params",
	}),
	workspaceController.deleteWorkspaceMembership
);

router.patch(
	"/:workspaceId/auto-capitalization",
	requireAuth({
		acceptedAuthModes: [AuthMode.JWT]
	}),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER],
		locationWorkspaceId: "params",
	}),
	param("workspaceId").exists().trim(),
	body("autoCapitalization").exists().trim().notEmpty(),
	validateRequest,
	workspaceController.toggleAutoCapitalization
);

export default router;
