import { Logger } from "pino";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  SALT_ROUNDS: z.coerce.number().default(10),
  // TODO(akhilmhdh): will be changed to one
  ENCRYPTION_KEY: z.string().optional(),
  ROOT_ENCRYPTION_KEY: z.string().optional(),
  HTTPS_ENABLED: z
    .enum(["true", "false"])
    .optional()
    .transform((val) => val === "true")
});

let envCfg: Readonly<z.infer<typeof envSchema>>;

export const getConfig = () => envCfg;
// cannot import singleton logger directly as it needs config to load various transport
export const initEnvConfig = (logger: Logger) => {
  const parsedEnv = envSchema.safeParse(process.env);
  if (!parsedEnv.success) {
    logger.error("Invalid environment variables. Check the error below");
    logger.error(parsedEnv.error);
    process.exit(-1);
  }
  envCfg = Object.freeze(parsedEnv.data);
};
