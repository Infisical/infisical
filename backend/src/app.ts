/* eslint-disable no-console */

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
  integrationAuth as integrationAuthRouter
} from './routes';

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

export const server = app.listen(PORT, () => {
  console.log(`Listening on PORT ${[PORT]}`);
});
