import dotenv from "dotenv";
dotenv.config();
import express from "express";
// eslint-disable-next-line @typescript-eslint/no-var-requires
require("express-async-errors");
import helmet from "helmet";
import cors from "cors";
import { DatabaseService } from "./services";
import { EELicenseService, GithubSecretScanningService } from "./ee/services";
import { setUpHealthEndpoint } from "./services/health";
import cookieParser from "cookie-parser";
import swaggerUi = require("swagger-ui-express");
import { Probot, createNodeMiddleware } from "probot";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const swaggerFile = require("../spec.json");
// eslint-disable-next-line @typescript-eslint/no-var-requires
import { apiLimiter } from "./helpers/rateLimiter";
import {
  action as eeActionRouter,
  cloudProducts as eeCloudProductsRouter,
  organizations as eeOrganizationsRouter,
  sso as eeSSORouter,
  secret as eeSecretRouter,
  secretSnapshot as eeSecretSnapshotRouter,
  users as eeUsersRouter,
  workspace as eeWorkspaceRouter,
  roles as v1RoleRouter,
  secretScanning as v1SecretScanningRouter
} from "./ee/routes/v1";
import {
  auth as v1AuthRouter,
  bot as v1BotRouter,
  integrationAuth as v1IntegrationAuthRouter,
  integration as v1IntegrationRouter,
  inviteOrg as v1InviteOrgRouter,
  key as v1KeyRouter,
  membershipOrg as v1MembershipOrgRouter,
  membership as v1MembershipRouter,
  organization as v1OrganizationRouter,
  password as v1PasswordRouter,
  secretApprovalPolicy as v1SecretApprovalPolicy,
  secretImps as v1SecretImpsRouter,
  secret as v1SecretRouter,
  secretsFolder as v1SecretsFolder,
  serviceToken as v1ServiceTokenRouter,
  signup as v1SignupRouter,
  userAction as v1UserActionRouter,
  user as v1UserRouter,
  webhooks as v1WebhooksRouter,
  workspace as v1WorkspaceRouter
} from "./routes/v1";
import {
  auth as v2AuthRouter,
  environment as v2EnvironmentRouter,
  organizations as v2OrganizationsRouter,
  secret as v2SecretRouter, // begin to phase out
  secrets as v2SecretsRouter,
  serviceAccounts as v2ServiceAccountsRouter,
  serviceTokenData as v2ServiceTokenDataRouter,
  signup as v2SignupRouter,
  tags as v2TagsRouter,
  users as v2UsersRouter,
  workspace as v2WorkspaceRouter
} from "./routes/v2";
import {
  auth as v3AuthRouter,
  secrets as v3SecretsRouter,
  signup as v3SignupRouter,
  workspaces as v3WorkspacesRouter
} from "./routes/v3";
import { healthCheck } from "./routes/status";
import { getLogger } from "./utils/logger";
import { RouteNotFoundError } from "./utils/errors";
import { requestErrorHandler } from "./middleware/requestErrorHandler";
import {
  getNodeEnv,
  getPort,
  getSecretScanningGitAppId,
  getSecretScanningPrivateKey,
  getSecretScanningWebhookProxy,
  getSecretScanningWebhookSecret,
  getSiteURL
} from "./config";
import { setup } from "./utils/setup";
import { syncSecretsToThirdPartyServices } from "./queues/integrations/syncSecretsToThirdPartyServices";
import { githubPushEventSecretScan } from "./queues/secret-scanning/githubScanPushEvent";
const SmeeClient = require("smee-client"); // eslint-disable-line

const main = async () => {
  await setup();

  await EELicenseService.initGlobalFeatureSet();

  const app = express();
  app.enable("trust proxy");
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());
  app.use(
    cors({
      credentials: true,
      origin: await getSiteURL()
    })
  );

  if (
    (await getSecretScanningGitAppId()) &&
    (await getSecretScanningWebhookSecret()) &&
    (await getSecretScanningPrivateKey())
  ) {
    const probot = new Probot({
      appId: await getSecretScanningGitAppId(),
      privateKey: await getSecretScanningPrivateKey(),
      secret: await getSecretScanningWebhookSecret()
    });

    if ((await getNodeEnv()) != "production") {
      const smee = new SmeeClient({
        source: await getSecretScanningWebhookProxy(),
        target: "http://backend:4000/ss-webhook",
        logger: console
      });

      smee.start();
    }

    app.use(
      createNodeMiddleware(GithubSecretScanningService, { probot, webhooksPath: "/ss-webhook" })
    ); // secret scanning webhook
  }

  if ((await getNodeEnv()) === "production") {
    // enable app-wide rate-limiting + helmet security
    // in production
    app.disable("x-powered-by");
    app.use(apiLimiter);
    app.use(helmet());
  }

  app.use((req, res, next) => {
    // default to IP address provided by Cloudflare
    // #swagger.ignore = true
    const cfIp = req.headers["cf-connecting-ip"];
    req.realIP = Array.isArray(cfIp) ? cfIp[0] : (cfIp as string) || req.ip;
    next();
  });

  // (EE) routes
  app.use("/api/v1/secret", eeSecretRouter);
  app.use("/api/v1/secret-snapshot", eeSecretSnapshotRouter);
  app.use("/api/v1/users", eeUsersRouter);
  app.use("/api/v1/workspace", eeWorkspaceRouter);
  app.use("/api/v1/action", eeActionRouter);
  app.use("/api/v1/organizations", eeOrganizationsRouter);
  app.use("/api/v1/sso", eeSSORouter);
  app.use("/api/v1/cloud-products", eeCloudProductsRouter);

  // v1 routes
  app.use("/api/v1/signup", v1SignupRouter);
  app.use("/api/v1/auth", v1AuthRouter);
  app.use("/api/v1/bot", v1BotRouter);
  app.use("/api/v1/user", v1UserRouter);
  app.use("/api/v1/user-action", v1UserActionRouter);
  app.use("/api/v1/organization", v1OrganizationRouter);
  app.use("/api/v1/workspace", v1WorkspaceRouter);
  app.use("/api/v1/membership-org", v1MembershipOrgRouter);
  app.use("/api/v1/membership", v1MembershipRouter); //
  app.use("/api/v1/key", v1KeyRouter);
  app.use("/api/v1/invite-org", v1InviteOrgRouter);
  app.use("/api/v1/secret", v1SecretRouter); // deprecate
  app.use("/api/v1/service-token", v1ServiceTokenRouter); // deprecate
  app.use("/api/v1/password", v1PasswordRouter);
  app.use("/api/v1/integration", v1IntegrationRouter);
  app.use("/api/v1/integration-auth", v1IntegrationAuthRouter);
  app.use("/api/v1/folders", v1SecretsFolder);
  app.use("/api/v1/secret-scanning", v1SecretScanningRouter);
  app.use("/api/v1/webhooks", v1WebhooksRouter);
  app.use("/api/v1/secret-imports", v1SecretImpsRouter);
  app.use("/api/v1/roles", v1RoleRouter);
  app.use("/api/v1/secret-approvals", v1SecretApprovalPolicy);

  // v2 routes (improvements)
  app.use("/api/v2/signup", v2SignupRouter);
  app.use("/api/v2/auth", v2AuthRouter);
  app.use("/api/v2/users", v2UsersRouter);
  app.use("/api/v2/organizations", v2OrganizationsRouter);
  app.use("/api/v2/workspace", v2EnvironmentRouter);
  app.use("/api/v2/workspace", v2TagsRouter);
  app.use("/api/v2/workspace", v2WorkspaceRouter);
  app.use("/api/v2/secret", v2SecretRouter); // deprecate
  app.use("/api/v2/secrets", v2SecretsRouter); // note: in the process of moving to v3/secrets
  app.use("/api/v2/service-token", v2ServiceTokenDataRouter);
  app.use("/api/v2/service-accounts", v2ServiceAccountsRouter); // new

  // v3 routes (experimental)
  app.use("/api/v3/auth", v3AuthRouter);
  app.use("/api/v3/secrets", v3SecretsRouter);
  app.use("/api/v3/workspaces", v3WorkspacesRouter);
  app.use("/api/v3/signup", v3SignupRouter);

  // api docs
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerFile));

  // server status
  app.use("/api", healthCheck);

  //* Handle unrouted requests and respond with proper error message as well as status code
  app.use((req, res, next) => {
    if (res.headersSent) return next();
    next(
      RouteNotFoundError({
        message: `The requested source '(${req.method})${req.url}' was not found`
      })
    );
  });

  app.use(requestErrorHandler);

  const server = app.listen(await getPort(), async () => {
    (await getLogger("backend-main")).info(`Server started listening at port ${await getPort()}`);
  });

  // await createTestUserForDevelopment();
  setUpHealthEndpoint(server);


  const serverCleanup = async () => {
    await DatabaseService.closeDatabase();
    syncSecretsToThirdPartyServices.close();
    githubPushEventSecretScan.close();

    process.exit(0);
  }

  process.on("SIGINT", function () {
    server.close(async () => {
      await serverCleanup()
    });
  });

  process.on("SIGTERM", function () {
    server.close(async () => {
      await serverCleanup()
    });
  });

  return server;
};

export default main();
