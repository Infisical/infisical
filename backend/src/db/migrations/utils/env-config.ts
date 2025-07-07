import { z } from "zod";

import { zpStr } from "@app/lib/zod";
import { crypto } from "@app/lib/crypto/cryptography";
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
    HSM_SLOT: z.coerce.number().optional().default(0)
  })
  // To ensure that basic encryption is always possible.
  .refine(
    (data) => Boolean(data.ENCRYPTION_KEY) || Boolean(data.ROOT_ENCRYPTION_KEY),
    "Either ENCRYPTION_KEY or ROOT_ENCRYPTION_KEY must be defined."
  )
  .transform((data) => ({
    ...data,
    isHsmConfigured:
      Boolean(data.HSM_LIB_PATH) && Boolean(data.HSM_PIN) && Boolean(data.HSM_KEY_LABEL) && data.HSM_SLOT !== undefined
  }));

export type TMigrationEnvConfig = z.infer<typeof envSchema>;

export const getMigrationEnvConfig = async (superAdminDAL: TSuperAdminDALFactory) => {
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

  const fipsEnabled = await crypto.initialize(superAdminDAL);

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
