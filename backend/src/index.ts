import dotenv from 'dotenv';
dotenv.config();

import * as Sentry from '@sentry/node';
import { SENTRY_DSN, NODE_ENV, MONGO_URL } from './config';
import { server } from './app';
import { DatabaseService } from './services';
import { setUpHealthEndpoint } from './services/health';
import { initSmtp } from './services/smtp';
import { setTransporter } from './helpers/nodemailer';

DatabaseService.initDatabase(MONGO_URL);

setUpHealthEndpoint(server);

setTransporter(initSmtp());

if (NODE_ENV !== 'test') {
  Sentry.init({
    dsn: SENTRY_DSN,
    tracesSampleRate: 1.0,
    debug: NODE_ENV === 'production' ? false : true,
    environment: NODE_ENV
  });
}
