import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import swaggerJSDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

dotenv.config();
import * as Sentry from '@sentry/node';
import { PORT, SENTRY_DSN, NODE_ENV, MONGO_URL, SITE_URL, POSTHOG_PROJECT_API_KEY, POSTHOG_HOST, TELEMETRY_ENABLED } from './config';
import { apiLimiter } from './helpers/rateLimiter';

const app = express();

Sentry.init({
	dsn: SENTRY_DSN,
	tracesSampleRate: 1.0,
	debug: NODE_ENV === 'production' ? false : true,
	environment: NODE_ENV
});

import {
	signup as signupRouter,
	auth as authRouter,
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

const connectWithRetry = () => {
	mongoose.connect(MONGO_URL)
	.then(() => console.log('Successfully connected to DB'))
	.catch((e) => {
		console.log('Failed to connect to DB ', e);
		setTimeout(() => {
			console.log(e);
		}, 5000);
	});
}

connectWithRetry();

app.enable('trust proxy');
app.use(cookieParser());
app.use(cors({
	credentials: true,
	origin: SITE_URL
}));

if (NODE_ENV === 'production') {
	// enable app-wide rate-limiting + helmet security
	// in production
	app.disable('x-powered-by');
	app.use(apiLimiter);
	app.use(helmet());
}

if (NODE_ENV === 'development') {
	const swaggerDefinition = {
		openapi: '3.0.0',
		info: {
			title: 'Infisical API',
			version: '1.0.0',
			description: 'Infisical is an open-source, E2EE tool to sync environment variables across your team and infrastructure.',
			license: {
				name: 'License',
				url: 'https://github.com/Infisical/infisical/blob/main/LICENSE'
			},
			contact: {
				name: 'Infisical',
				url: 'https://infisical.com'
			},
		},
		servers: [
			{
				url: 'http://localhost:8080/api/v1',
				description: 'Development server'
			}
		]
	}
	
	const options = {
		swaggerDefinition,
		apis: ['./src/routes/*.ts']
	}
	
	const swaggerSpec = swaggerJSDoc(options);
	app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}

app.use(express.json());

// routers
app.use('/api/v1/signup', signupRouter);
app.use('/api/v1/auth', authRouter);
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

app.listen(PORT, () => {
	console.log('Listening on PORT ' + PORT);
});
