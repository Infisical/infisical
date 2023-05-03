import * as Sentry from '@sentry/node';
import { DatabaseService } from '../../services';
import { setTransporter } from '../../helpers/nodemailer';
import { initSmtp } from '../../services/smtp';
import { createTestUserForDevelopment } from '../addDevelopmentUser'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { patchRouterParam } = require('../patchAsyncRoutes');
import { 
    backfillSecretVersions, 
    backfillSecretBlindIndexData, 
    backfillEncryptionMetadata
} from './backfill';
import { 
    getNodeEnv,
    getMongoURL,
    getSentryDSN
} from '../../config';

/**
 * Prepare Infisical upon startup. This includes tasks like:
 * - Initializing SMTP configuration
 * - Initializing the database connection
 * - Initializing Sentry
 * - Backfilling data
 */
export const setup = async () => {
    // initializing SMTP configuration
    setTransporter(await initSmtp());
    
    // initializing the database connection
    await DatabaseService.initDatabase(await getMongoURL());

    // backfilling data
    await backfillSecretVersions();
    await backfillSecretBlindIndexData();
    await backfillEncryptionMetadata();
    
    // initializing Sentry
    if ((await getNodeEnv()) !== 'development') {
        Sentry.init({
            dsn: await getSentryDSN(),
            tracesSampleRate: 1.0,
            debug: await getNodeEnv() === 'production' ? false : true,
            environment: await getNodeEnv()
        });
    }

    patchRouterParam();
    await createTestUserForDevelopment();
}

