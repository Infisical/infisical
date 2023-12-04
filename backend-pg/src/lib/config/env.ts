import { Logger } from "pino";
import { z } from "zod";

import { zpStr } from "../zod";

const zodStrBool = z
  .enum(["true", "false"])
  .optional()
  .transform((val) => val === "true");

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  HOST: zpStr(z.string().default("localhost")),
  DB_CONNECTION_URI: zpStr(z.string().describe("Postgres database conntection string")),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  SALT_ROUNDS: z.coerce.number().default(10),
  // TODO(akhilmhdh): will be changed to one
  ENCRYPTION_KEY: zpStr(z.string().optional()),
  ROOT_ENCRYPTION_KEY: zpStr(z.string().optional()),
  HTTPS_ENABLED: zodStrBool,
  // smtp options
  SMTP_HOST: zpStr(z.string().optional()),
  SMTP_SECURE: zodStrBool,
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USERNAME: zpStr(z.string().optional()),
  SMTP_PASSWORD: zpStr(z.string().optional()),
  SMTP_FROM_ADDRESS: zpStr(z.string().optional()),
  SMTP_FROM_NAME: zpStr(z.string().optional().default("Infisical")),
  COOKIE_SECRET_SIGN_KEY: z.string().default("g5giLbOMpaJhqEogXApkiw2ZFW5Q0jvA"),
  SITE_URL: zpStr(z.string().optional()),
  // jwt options
  JWT_AUTH_SECRET: zpStr(z.string()),
  JWT_AUTH_LIFETIME: zpStr(z.string().default("10d")),
  JWT_SIGNUP_LIFETIME: zpStr(z.string().default("15m")),
  JWT_REFRESH_LIFETIME: zpStr(z.string().default("90d")),
  JWT_MFA_LIFETIME: zpStr(z.string().default("5m"))
});

let envCfg: Readonly<z.infer<typeof envSchema>>;

export const getConfig = () => envCfg;
// cannot import singleton logger directly as it needs config to load various transport
export const initEnvConfig = (logger: Logger) => {
  const parsedEnv = envSchema.safeParse(process.env);
  if (!parsedEnv.success) {
    logger.error("Invalid environment variables. Check the error below");
    logger.error(parsedEnv.error.issues);
    process.exit(-1);
  }
  envCfg = Object.freeze(parsedEnv.data);
  return envCfg;
};

export const formatSmtpConfig = () => ({
  host: envCfg.SMTP_HOST,
  port: envCfg.SMTP_PORT,
  auth:
    envCfg.SMTP_USERNAME && envCfg.SMTP_PASSWORD
      ? { user: envCfg.SMTP_USERNAME, pass: envCfg.SMTP_PASSWORD }
      : undefined,
  secure: envCfg.SMTP_SECURE,
  from: `"${envCfg.SMTP_FROM_NAME}" <${envCfg.SMTP_FROM_ADDRESS}>`
});
