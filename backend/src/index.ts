import dotenv from "dotenv";
dotenv.config();
import express from "express";
// eslint-disable-next-line @typescript-eslint/no-var-requires
require("express-async-errors");
import helmet from "helmet";
import cors from "cors";
import { DatabaseService } from "./services";
import { EELicenseService } from "./ee/services";
import { setUpHealthEndpoint } from "./services/health";
import cookieParser from "cookie-parser";
import swaggerUi = require("swagger-ui-express");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const swaggerFile = require("../spec.json");
// eslint-disable-next-line @typescript-eslint/no-var-requires
import { apiLimiter } from "./helpers/rateLimiter";
import {
  action as eeActionRouter,
  cloudProducts as eeCloudProductsRouter,
  organizations as eeOrganizationsRouter,
  secret as eeSecretRouter,
  secretSnapshot as eeSecretSnapshotRouter,
  workspace as eeWorkspaceRouter
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
  secret as v1SecretRouter,
  secretScanning as v1SecretScanningRouter,
  secretsFolder as v1SecretsFolder,
  serviceToken as v1ServiceTokenRouter,
  signup as v1SignupRouter,
  userAction as v1UserActionRouter,
  user as v1UserRouter,
  workspace as v1WorkspaceRouter,
  webhooks as v1WebhooksRouter
} from "./routes/v1";
import {
  auth as v2AuthRouter,
  signup as v2SignupRouter,
  users as v2UsersRouter,
  organizations as v2OrganizationsRouter,
  workspace as v2WorkspaceRouter,
  secret as v2SecretRouter, // begin to phase out
  secrets as v2SecretsRouter,
  serviceTokenData as v2ServiceTokenDataRouter,
  serviceAccounts as v2ServiceAccountsRouter,
  environment as v2EnvironmentRouter,
  tags as v2TagsRouter
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
import { getNodeEnv, getPort, getSiteURL } from "./config";
import { setup } from "./utils/setup";

const main = async () => {
  await setup();

  await EELicenseService.initGlobalFeatureSet();

  const app = express();
  app.enable("trust proxy");
  app.use(express.json());
  app.use(cookieParser());
  app.use(
    cors({
      credentials: true,
      origin: await getSiteURL()
    })
  );

  if ((await getNodeEnv()) === "production") {
    // enable app-wide rate-limiting + helmet security
    // in production
    app.disable("x-powered-by");
    app.use(apiLimiter);
    app.use(helmet());
  }

  app.use((req, res, next) => {
    // default to IP address provided by Cloudflare
    const cfIp = req.headers["cf-connecting-ip"];
    req.realIP = Array.isArray(cfIp) ? cfIp[0] : (cfIp as string) || req.ip;
    next();
  });

  // (EE) routes
  app.use("/api/v1/secret", eeSecretRouter);
  app.use("/api/v1/secret-snapshot", eeSecretSnapshotRouter);
  app.use("/api/v1/workspace", eeWorkspaceRouter);
  app.use("/api/v1/action", eeActionRouter);
  app.use("/api/v1/organizations", eeOrganizationsRouter);
  app.use("/api/v1/cloud-products", eeCloudProductsRouter);

  // v1 routes (default)
  app.use("/api/v1/signup", v1SignupRouter);
  app.use("/api/v1/auth", v1AuthRouter);
  app.use("/api/v1/bot", v1BotRouter);
  app.use("/api/v1/user", v1UserRouter);
  app.use("/api/v1/user-action", v1UserActionRouter);
  app.use("/api/v1/organization", v1OrganizationRouter);
  app.use("/api/v1/workspace", v1WorkspaceRouter);
  app.use("/api/v1/membership-org", v1MembershipOrgRouter);
  app.use("/api/v1/membership", v1MembershipRouter);
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

  server.on("close", async () => {
    await DatabaseService.closeDatabase();
  });

  return server;
};

export default main();
