// eslint-disable-next-line @typescript-eslint/no-var-requires
const { patchRouterParam } = require('./utils/patchAsyncRoutes');

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import swaggerUi = require('swagger-ui-express');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const swaggerFile = require('../spec.json');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const requestIp = require('request-ip');

dotenv.config();
import { PORT, NODE_ENV, SITE_URL } from './config';
import { apiLimiter } from './helpers/rateLimiter';

import {
  workspace as eeWorkspaceRouter,
  secret as eeSecretRouter,
  secretSnapshot as eeSecretSnapshotRouter,
  action as eeActionRouter
} from './ee/routes/v1';
import {
  signup as v1SignupRouter,
  auth as v1AuthRouter,
  bot as v1BotRouter,
  organization as v1OrganizationRouter,
  workspace as v1WorkspaceRouter,
  membershipOrg as v1MembershipOrgRouter,
  membership as v1MembershipRouter,
  key as v1KeyRouter,
  inviteOrg as v1InviteOrgRouter,
  user as v1UserRouter,
  userAction as v1UserActionRouter,
  secret as v1SecretRouter,
  serviceToken as v1ServiceTokenRouter,
  password as v1PasswordRouter,
  stripe as v1StripeRouter,
  integration as v1IntegrationRouter,
  integrationAuth as v1IntegrationAuthRouter,
  secretApprovalRequest as v1SecretApprovalRequest
} from './routes/v1';
import {
  signup as v2SignupRouter,
  auth as v2AuthRouter,
  users as v2UsersRouter,
  organizations as v2OrganizationsRouter,
  workspace as v2WorkspaceRouter,
  secret as v2SecretRouter, // begin to phase out
  secrets as v2SecretsRouter,
  serviceTokenData as v2ServiceTokenDataRouter,
  apiKeyData as v2APIKeyDataRouter,
  environment as v2EnvironmentRouter,
  tags as v2TagsRouter,
} from './routes/v2';

import { healthCheck } from './routes/status';

import { getLogger } from './utils/logger';
import { RouteNotFoundError } from './utils/errors';
import { handleMongoInvalidDataError, requestErrorHandler } from './middleware/requestErrorHandler';

// patch async route params to handle Promise Rejections
patchRouterParam();

export const app = express();

app.enable('trust proxy');
app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    credentials: true,
    origin: SITE_URL
  })
);

app.use(requestIp.mw())

if (NODE_ENV === 'production') {
  // enable app-wide rate-limiting + helmet security
  // in production
  app.disable('x-powered-by');
  app.use(apiLimiter);
  app.use(helmet());
}

// (EE) routes
app.use('/api/v1/secret', eeSecretRouter);
app.use('/api/v1/secret-snapshot', eeSecretSnapshotRouter);
app.use('/api/v1/workspace', eeWorkspaceRouter);
app.use('/api/v1/action', eeActionRouter);

// v1 routes
app.use('/api/v1/signup', v1SignupRouter);
app.use('/api/v1/auth', v1AuthRouter);
app.use('/api/v1/bot', v1BotRouter);
app.use('/api/v1/user', v1UserRouter);
app.use('/api/v1/user-action', v1UserActionRouter);
app.use('/api/v1/organization', v1OrganizationRouter);
app.use('/api/v1/workspace', v1WorkspaceRouter);
app.use('/api/v1/membership-org', v1MembershipOrgRouter);
app.use('/api/v1/membership', v1MembershipRouter);
app.use('/api/v1/key', v1KeyRouter);
app.use('/api/v1/invite-org', v1InviteOrgRouter);
app.use('/api/v1/secret', v1SecretRouter);
app.use('/api/v1/service-token', v1ServiceTokenRouter); // deprecated
app.use('/api/v1/password', v1PasswordRouter);
app.use('/api/v1/stripe', v1StripeRouter);
app.use('/api/v1/integration', v1IntegrationRouter);
app.use('/api/v1/integration-auth', v1IntegrationAuthRouter);
app.use('/api/v1/secrets-approval-request', v1SecretApprovalRequest)

// v2 routes
app.use('/api/v2/signup', v2SignupRouter);
app.use('/api/v2/auth', v2AuthRouter);
app.use('/api/v2/users', v2UsersRouter);
app.use('/api/v2/organizations', v2OrganizationsRouter);
app.use('/api/v2/workspace', v2EnvironmentRouter);
app.use('/api/v2/workspace', v2TagsRouter);
app.use('/api/v2/workspace', v2WorkspaceRouter);
app.use('/api/v2/secret', v2SecretRouter); // deprecated
app.use('/api/v2/secrets', v2SecretsRouter);
app.use('/api/v2/service-token', v2ServiceTokenDataRouter); // TODO: turn into plural route
app.use('/api/v2/api-key', v2APIKeyDataRouter);

// api docs 
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerFile))

// Server status
app.use('/api', healthCheck)

//* Handle unrouted requests and respond with proper error message as well as status code
app.use((req, res, next) => {
  if (res.headersSent) return next();
  next(RouteNotFoundError({ message: `The requested source '(${req.method})${req.url}' was not found` }))
})

// handle mongo validation errors
app.use(handleMongoInvalidDataError);

//* Error Handling Middleware (must be after all routing logic)
app.use(requestErrorHandler)

export const server = app.listen(PORT, () => {
  getLogger("backend-main").info(`Server started listening at port ${PORT}`)
});
