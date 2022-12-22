
import express, { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import * as Sentry from '@sentry/node';

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
import { getLogger } from './utils/logger';
import RequestError, { LogLevel } from './utils/requestError';
import { InternalServerError, RouteNotFoundError } from './utils/errors';

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


//* Handle unrouted requests and respond with proper error message as well as status code
app.use((req, res, next)=>{
  if(res.headersSent) return next();
  next(RouteNotFoundError({message: `The requested source '(${req.method})${req.url}' was not found`}))
})

//* Error Handling Middleware (must be after all routing logic)
app.use((error: RequestError|Error, req: Request, res: Response, next: NextFunction)=>{
  if(res.headersSent) return next();
  //TODO: Find better way to type check for error. In current setting you need to cast type to get the functions and variables from RequestError
  if(!(error instanceof RequestError)){
      error = InternalServerError({context: {exception: error.message}, stack: error.stack})
      getLogger('backend-main').log((<RequestError>error).levelName.toLowerCase(), (<RequestError>error).message)
  }

  //* Set Sentry user identification if req.user is populated
  if(req.user !== undefined && req.user !== null){
    Sentry.setUser({ email: req.user.email })
  }
  //* Only sent error to Sentry if LogLevel is one of the following level 'ERROR', 'EMERGENCY' or 'CRITICAL'
  //* with this we will eliminate false-positive errors like 'BadRequestError', 'UnauthorizedRequestError' and so on
  if([LogLevel.ERROR, LogLevel.EMERGENCY, LogLevel.CRITICAL].includes((<RequestError>error).level)){
    Sentry.captureException(error)
  }
  
  res.status((<RequestError>error).statusCode).json((<RequestError>error).format(req))
  next()
})


export const server = app.listen(PORT, () => {
  getLogger("backend-main").info(`Server started listening at port ${PORT}`)
});
