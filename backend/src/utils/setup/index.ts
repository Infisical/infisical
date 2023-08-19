import * as Sentry from "@sentry/node";
import { DatabaseService, TelemetryService } from "../../services";
import { setTransporter } from "../../helpers/nodemailer";
import { EELicenseService } from "../../ee/services";
import { initSmtp } from "../../services/smtp";
import { createTestUserForDevelopment } from "../addDevelopmentUser";
// eslint-disable-next-line @typescript-eslint/no-var-requires
import { validateEncryptionKeysConfig } from "./validateConfig";
import {
  backfillBotOrgs,
  backfillBots,
  backfillEncryptionMetadata,
  backfillIntegration,
  backfillSecretBlindIndexData,
  backfillSecretFolders,
  backfillSecretVersions,
  backfillServiceToken,
  backfillServiceTokenMultiScope,
  backfillTrustedIps,
  backfillUserAuthMethods
} from "./backfillData";
import {
  reencryptBotOrgKeys,
  reencryptBotPrivateKeys,
  reencryptSecretBlindIndexDataSalts
} from "./reencryptData";
import {
  getMongoURL,
  getNodeEnv,
  getRedisUrl,
  getSentryDSN
} from "../../config";
import { initializePassport } from "../auth";

/**
 * Prepare Infisical upon startup. This includes tasks like:
 * - Log initial telemetry message
 * - Initializing SMTP configuration
 * - Initializing the instance global feature set (if applicable)
 * - Initializing the database connection
 * - Initializing Sentry
 * - Backfilling data
 * - Re-encrypting data
 */
export const setup = async () => {
  if (await getRedisUrl() === undefined || await getRedisUrl() === "") {
    console.error("WARNING: Redis is not yet configured. Infisical may not function as expected without it.")
  }

  await validateEncryptionKeysConfig();
  await TelemetryService.logTelemetryMessage();

  // initializing SMTP configuration
  setTransporter(await initSmtp());

  // initializing global feature set
  await EELicenseService.initGlobalFeatureSet();

  // initializing the database connection
  await DatabaseService.initDatabase(await getMongoURL());

  await initializePassport();

  // re-encrypt any data previously encrypted under server hex 128-bit ENCRYPTION_KEY
  // to base64 256-bit ROOT_ENCRYPTION_KEY
  // await reencryptBotPrivateKeys();
  // await reencryptSecretBlindIndexDataSalts();

  // initializing the database connection
  await DatabaseService.initDatabase(await getMongoURL());

  /**
   * NOTE: the order in this setup function is critical.
   * It is important to backfill data before performing any re-encryption functionality.
   */

  // backfilling data to catch up with new collections and updated fields
  await backfillSecretVersions();
  await backfillBots();
  await backfillBotOrgs();
  await backfillSecretBlindIndexData();
  await backfillEncryptionMetadata();
  await backfillSecretFolders();
  await backfillServiceToken();
  await backfillIntegration();
  await backfillServiceTokenMultiScope();
  await backfillTrustedIps();
  await backfillUserAuthMethods();

  // re-encrypt any data previously encrypted under server hex 128-bit ENCRYPTION_KEY
  // to base64 256-bit ROOT_ENCRYPTION_KEY
  await reencryptBotPrivateKeys();
  await reencryptBotOrgKeys();
  await reencryptSecretBlindIndexDataSalts();

  // initializing Sentry
  Sentry.init({
    dsn: await getSentryDSN(),
    tracesSampleRate: 1.0,
    debug: (await getNodeEnv()) === "production" ? false : true,
    environment: await getNodeEnv()
  });

  await createTestUserForDevelopment();
};
