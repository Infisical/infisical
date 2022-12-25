
import { patchRouterParam } from './utils/patchAsyncRoutes';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';

dotenv.config();
import { PORT, NODE_ENV, SITE_URL } from './config';
import { apiLimiter } from './helpers/rateLimiter';

import {
  signup as signupRouter,
  auth as authRouter,
  bot as botRouter,
  organization as organizationRouter,
  workspace as workspaceRouter,
  membershipOrg as membershipOrgRouter,
  membership as membershipRouter,
  key as keyRouter,
  inviteOrg as inviteOrgRouter,
  user as userRouter,
  userAction as userActionRouter,
  secret as secretRouter,
  serviceToken as serviceTokenRouter,
  password as passwordRouter,
  stripe as stripeRouter,
  integration as integrationRouter,
  integrationAuth as integrationAuthRouter,
  apiKey as apiKeyRouter
} from './routes';
import { getLogger } from './utils/logger';
import { RouteNotFoundError } from './utils/errors';
import { requestErrorHandler } from './middleware/requestErrorHandler';

//* Patch Async route params to handle Promise Rejections
patchRouterParam()

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

if (NODE_ENV === 'production') {
  // enable app-wide rate-limiting + helmet security
  // in production
  app.disable('x-powered-by');
  app.use(apiLimiter);
  app.use(helmet());
}

// routers
app.use('/api/v1/signup', signupRouter);
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/bot', botRouter);
app.use('/api/v1/user', userRouter);
app.use('/api/v1/user-action', userActionRouter);
app.use('/api/v1/organization', organizationRouter);
app.use('/api/v1/workspace', workspaceRouter);
app.use('/api/v1/membership-org', membershipOrgRouter);
app.use('/api/v1/membership', membershipRouter);
app.use('/api/v1/key', keyRouter);
app.use('/api/v1/invite-org', inviteOrgRouter);
app.use('/api/v1/secret', secretRouter);
app.use('/api/v1/service-token', serviceTokenRouter);
app.use('/api/v1/password', passwordRouter);
app.use('/api/v1/stripe', stripeRouter);
app.use('/api/v1/integration', integrationRouter);
app.use('/api/v1/integration-auth', integrationAuthRouter);
app.use('/api/v1/api-key', apiKeyRouter);

//* Handle unrouted requests and respond with proper error message as well as status code
app.use((req, res, next)=>{
  if(res.headersSent) return next();
  next(RouteNotFoundError({message: `The requested source '(${req.method})${req.url}' was not found`}))
})

//* Error Handling Middleware (must be after all routing logic)
app.use(requestErrorHandler)


export const server = app.listen(PORT, () => {
  getLogger("backend-main").info(`Server started listening at port ${PORT}`)
});
