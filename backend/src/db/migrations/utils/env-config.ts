import { z } from "zod";

import { THsmServiceFactory } from "@app/ee/services/hsm/hsm-service";
import { crypto } from "@app/lib/crypto/cryptography";
import { removeTrailingSlash } from "@app/lib/fn";
import { zpStr } from "@app/lib/zod";
import { TKmsRootConfigDALFactory } from "@app/services/kms/kms-root-config-dal";
import { TSuperAdminDALFactory } from "@app/services/super-admin/super-admin-dal";

const envSchema = z
  .object({
    DB_CONNECTION_URI: zpStr(z.string().describe("Postgres database connection string")).default(
      `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`
    ),
    DB_ROOT_CERT: zpStr(z.string().describe("Postgres database base64-encoded CA cert").optional()),
    DB_HOST: zpStr(z.string().describe("Postgres database host").optional()),
    DB_PORT: zpStr(z.string().describe("Postgres database port").optional()).default("5432"),
    DB_USER: zpStr(z.string().describe("Postgres database username").optional()),
    DB_PASSWORD: zpStr(z.string().describe("Postgres database password").optional()),
    DB_NAME: zpStr(z.string().describe("Postgres database name").optional()),
    // TODO(akhilmhdh): will be changed to one
    ENCRYPTION_KEY: zpStr(z.string().optional()),
    ROOT_ENCRYPTION_KEY: zpStr(z.string().optional()),
    // HSM
    HSM_LIB_PATH: zpStr(z.string().optional()),
    HSM_PIN: zpStr(z.string().optional()),
    HSM_KEY_LABEL: zpStr(z.string().optional()),
    HSM_SLOT: z.coerce.number().optional().default(0),
    HSM_ENCRYPTION_STRATEGY: zpStr(z.enum(["AES", "RSA_PKCS"]).optional().default("AES")),

    LICENSE_SERVER_URL: zpStr(z.string().optional().default("https://portal.infisical.com")),
    LICENSE_SERVER_KEY: zpStr(z.string().optional()),
    LICENSE_KEY: zpStr(z.string().optional()),
    LICENSE_KEY_OFFLINE: zpStr(z.string().optional()),
    INTERNAL_REGION: zpStr(z.enum(["us", "eu"]).optional()),

    SITE_URL: zpStr(z.string().transform((val) => (val ? removeTrailingSlash(val) : val))).optional()
  })
  // To ensure that basic encryption is always possible.
  .transform((data) => ({
    ...data,
    isHsmConfigured:
      Boolean(data.HSM_LIB_PATH) && Boolean(data.HSM_PIN) && Boolean(data.HSM_KEY_LABEL) && data.HSM_SLOT !== undefined
  }));

export type TMigrationEnvConfig = z.infer<typeof envSchema>;

export const getMigrationHsmConfig = () => {
  const parsedEnv = envSchema.safeParse(process.env);
  if (!parsedEnv.success) {
    // eslint-disable-next-line no-console
    console.error("Invalid environment variables. Check the error below");
    // eslint-disable-next-line no-console
    console.error(parsedEnv.error.issues);
    process.exit(-1);
  }
  return {
    isHsmConfigured: parsedEnv.data.isHsmConfigured,
    HSM_PIN: parsedEnv.data.HSM_PIN,
    HSM_SLOT: parsedEnv.data.HSM_SLOT,
    HSM_LIB_PATH: parsedEnv.data.HSM_LIB_PATH,
    HSM_KEY_LABEL: parsedEnv.data.HSM_KEY_LABEL,
    HSM_ENCRYPTION_STRATEGY: parsedEnv.data.HSM_ENCRYPTION_STRATEGY
  };
};

export const getMigrationEnvConfig = async (
  superAdminDAL: TSuperAdminDALFactory,
  hsmService: THsmServiceFactory,
  kmsRootConfigDAL: TKmsRootConfigDALFactory
) => {
  const parsedEnv = envSchema.safeParse(process.env);
  if (!parsedEnv.success) {
    // eslint-disable-next-line no-console
    console.error("Invalid environment variables. Check the error below");
    // eslint-disable-next-line no-console
    console.error(
      "Infisical now automatically runs database migrations during boot up, so you no longer need to run them separately."
    );
    // eslint-disable-next-line no-console
    console.error(parsedEnv.error.issues);
    process.exit(-1);
  }

  let envCfg = Object.freeze(parsedEnv.data);

  const fipsEnabled = await crypto.initialize(superAdminDAL, hsmService, kmsRootConfigDAL, envCfg);

  // Fix for 128-bit entropy encryption key expansion issue:
  // In FIPS it is not ideal to expand a 128-bit key into 256-bit. We solved this issue in the past by creating the ROOT_ENCRYPTION_KEY.
  // If FIPS mode is enabled, we set the value of ROOT_ENCRYPTION_KEY to the value of ENCRYPTION_KEY.
  // ROOT_ENCRYPTION_KEY is expected to be a 256-bit base64-encoded key, unlike the 32-byte key of ENCRYPTION_KEY.
  // When ROOT_ENCRYPTION_KEY is set, our cryptography will always use a 256-bit entropy encryption key. So for the sake of FIPS we should just roll over the value of ENCRYPTION_KEY to ROOT_ENCRYPTION_KEY.
  if (fipsEnabled) {
    const newEnvCfg = {
      ...envCfg,
      ROOT_ENCRYPTION_KEY: envCfg.ENCRYPTION_KEY
    };
    delete newEnvCfg.ENCRYPTION_KEY;

    envCfg = Object.freeze(newEnvCfg);
  }

  return envCfg;
};
