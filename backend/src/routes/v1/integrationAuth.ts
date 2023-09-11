import express from "express";
const router = express.Router();
import { requireAuth } from "../../middleware";
import { AuthMode } from "../../variables";
import { integrationAuthController } from "../../controllers/v1";

router.get(
  "/integration-options",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  integrationAuthController.getIntegrationOptions
);

router.get(
  "/:integrationAuthId",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  integrationAuthController.getIntegrationAuth
);

router.post(
  "/oauth-token",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  integrationAuthController.oAuthExchange
);

router.post(
  "/access-token",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT, AuthMode.API_KEY]
  }),
  integrationAuthController.saveIntegrationToken
);

router.get(
  "/:integrationAuthId/apps",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  integrationAuthController.getIntegrationAuthApps
);

router.get(
  "/:integrationAuthId/teams",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  integrationAuthController.getIntegrationAuthTeams
);

router.get(
  "/:integrationAuthId/vercel/branches",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  integrationAuthController.getIntegrationAuthVercelBranches
);

router.get(
  "/:integrationAuthId/railway/environments",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  integrationAuthController.getIntegrationAuthRailwayEnvironments
);

router.get(
  "/:integrationAuthId/railway/services",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  integrationAuthController.getIntegrationAuthRailwayServices
);

router.get(
  "/:integrationAuthId/bitbucket/workspaces",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  integrationAuthController.getIntegrationAuthBitBucketWorkspaces
);

router.get(
  "/:integrationAuthId/northflank/secret-groups",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  integrationAuthController.getIntegrationAuthNorthflankSecretGroups
);

router.get(
  "/:integrationAuthId/teamcity/build-configs",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  integrationAuthController.getIntegrationAuthTeamCityBuildConfigs
);

router.delete(
  "/:integrationAuthId",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  integrationAuthController.deleteIntegrationAuth
);

export default router;
