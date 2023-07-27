import express from "express";
const router = express.Router();
import { body, param, query } from "express-validator";
import {
	requireAuth,
	requireIntegrationAuthorizationAuth,
	requireWorkspaceAuth,
	validateRequest,
} from "../../middleware";
import {
	ADMIN, 
	AUTH_MODE_API_KEY,
	AUTH_MODE_JWT,
	MEMBER,
} from "../../variables";
import { integrationAuthController } from "../../controllers/v1";

router.get(
	"/integration-options",
	requireAuth({
        acceptedAuthModes: [AUTH_MODE_JWT],
    }),
	integrationAuthController.getIntegrationOptions
);

router.get(
	"/:integrationAuthId",
	requireAuth({
        acceptedAuthModes: [AUTH_MODE_JWT],
    }),
	requireIntegrationAuthorizationAuth({
		acceptedRoles: [ADMIN, MEMBER],
	}),
	param("integrationAuthId"),
	validateRequest,
	integrationAuthController.getIntegrationAuth	
);

router.post(
	"/oauth-token",
	requireAuth({
        acceptedAuthModes: [AUTH_MODE_JWT],
    }),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER],
		locationWorkspaceId: "body",
	}),
	body("workspaceId").exists().trim().notEmpty(),
	body("code").exists().trim().notEmpty(),
	body("integration").exists().trim().notEmpty(),
	validateRequest,
	integrationAuthController.oAuthExchange
);

router.post(
	"/access-token",
	body("workspaceId").exists().trim().notEmpty(),
	body("accessId").trim(),
	body("accessToken").exists().trim().notEmpty(),
	body("url").trim(),
	body("namespace").trim(),
	body("integration").exists().trim().notEmpty(),
	validateRequest,
	requireAuth({
        acceptedAuthModes: [AUTH_MODE_JWT, AUTH_MODE_API_KEY],
    }),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER],
		locationWorkspaceId: "body",
	}),
	integrationAuthController.saveIntegrationAccessToken
);

router.get(
	"/:integrationAuthId/apps",
	requireAuth({
        acceptedAuthModes: [AUTH_MODE_JWT],
    }),
	requireIntegrationAuthorizationAuth({
		acceptedRoles: [ADMIN, MEMBER],
	}),
	param("integrationAuthId"),
	query("teamId"),
	query("workspaceSlug"),
	validateRequest,
	integrationAuthController.getIntegrationAuthApps
);

router.get(
	"/:integrationAuthId/teams",
	requireAuth({
        acceptedAuthModes: [AUTH_MODE_JWT],
    }),
	requireIntegrationAuthorizationAuth({
		acceptedRoles: [ADMIN, MEMBER],
	}),
	param("integrationAuthId"),
	validateRequest,
	integrationAuthController.getIntegrationAuthTeams
);

router.get(
	"/:integrationAuthId/vercel/branches",
	requireAuth({
        acceptedAuthModes: ["jwt"],
    }),
	requireIntegrationAuthorizationAuth({
		acceptedRoles: [ADMIN, MEMBER],
	}),
	param("integrationAuthId").exists().isString(),
	query("appId").exists().isString(),
	query("teamId").optional().isString(),
	validateRequest,
	integrationAuthController.getIntegrationAuthVercelBranches
);

router.get(
	"/:integrationAuthId/railway/environments",
	requireAuth({
		acceptedAuthModes: ["jwt"],
	}),
	requireIntegrationAuthorizationAuth({
		acceptedRoles: [ADMIN, MEMBER],
	}),
	param("integrationAuthId").exists().isString(),
	query("appId").exists().isString(),
	validateRequest,
	integrationAuthController.getIntegrationAuthRailwayEnvironments
);

router.get(
	"/:integrationAuthId/railway/services",
	requireAuth({
		acceptedAuthModes: ["jwt"],
	}),
	requireIntegrationAuthorizationAuth({
		acceptedRoles: [ADMIN, MEMBER],
	}),
	param("integrationAuthId").exists().isString(),
	query("appId").exists().isString(),
	validateRequest,
	integrationAuthController.getIntegrationAuthRailwayServices
);

router.get(
	"/:integrationAuthId/bitbucket/workspaces",
	requireAuth({
        acceptedAuthModes: [AUTH_MODE_JWT],
    }),
	requireIntegrationAuthorizationAuth({
		acceptedRoles: [ADMIN, MEMBER],
	}),
	param("integrationAuthId").exists().isString(),
	validateRequest,
	integrationAuthController.getIntegrationAuthBitBucketWorkspaces
);

router.get(
	"/:integrationAuthId/northflank/secret-groups",
	requireAuth({
        acceptedAuthModes: [AUTH_MODE_JWT],
    }),
	requireIntegrationAuthorizationAuth({
		acceptedRoles: [ADMIN, MEMBER],
	}),
	param("integrationAuthId").exists().isString(),
	query("appId").exists().isString(),
	validateRequest,
	integrationAuthController.getIntegrationAuthNorthflankSecretGroups
);

router.delete(
	"/:integrationAuthId",
	requireAuth({
        acceptedAuthModes: [AUTH_MODE_JWT],
    }),
	requireIntegrationAuthorizationAuth({
		acceptedRoles: [ADMIN, MEMBER],
		attachAccessToken: false,
	}),
	param("integrationAuthId"),
	validateRequest,
	integrationAuthController.deleteIntegrationAuth
);

export default router;
