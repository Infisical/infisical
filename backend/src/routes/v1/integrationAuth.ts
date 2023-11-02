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
  "/:integrationAuthId/checkly/groups",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  integrationAuthController.getIntegrationAuthChecklyGroups
);

router.get(
  "/:integrationAuthId/qovery/orgs",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  integrationAuthController.getIntegrationAuthQoveryOrgs
);

router.get(
  "/:integrationAuthId/qovery/projects",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  integrationAuthController.getIntegrationAuthQoveryProjects
);

router.get(
  "/:integrationAuthId/qovery/environments",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  integrationAuthController.getIntegrationAuthQoveryEnvironments
);

router.get(
  "/:integrationAuthId/qovery/apps",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  integrationAuthController.getIntegrationAuthQoveryApps
);

router.get(
  "/:integrationAuthId/qovery/containers",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  integrationAuthController.getIntegrationAuthQoveryContainers
);

router.get(
  "/:integrationAuthId/qovery/jobs",
  requireAuth({
    acceptedAuthModes: [AuthMode.JWT]
  }),
  integrationAuthController.getIntegrationAuthQoveryJobs
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
