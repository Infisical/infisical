import { z } from "zod";

import { PamAccountType } from "../pam/pam-enums";

const ACCOUNT_TYPE_CONFIGS = {
  [PamAccountType.Postgres]: {
    connectionDetails: z.object({
      host: z.string().trim().min(1).max(255),
      port: z.coerce.number(),
      database: z.string().trim().min(1).max(255),
      sslEnabled: z.boolean(),
      sslRejectUnauthorized: z.boolean(),
      sslCertificate: z
        .string()
        .trim()
        .transform((v) => v || undefined)
        .optional()
    }),
    credentials: z.object({
      username: z.string().trim().min(1).max(63),
      password: z.string().trim().min(1).max(256)
    })
  },

  [PamAccountType.SSH]: {
    connectionDetails: z.object({
      host: z.string().trim().min(1).max(255),
      port: z.coerce.number()
    }),
    credentials: z.discriminatedUnion("authMethod", [
      z.object({
        authMethod: z.literal("password"),
        username: z.string().trim().min(1),
        password: z.string().trim().min(1)
      }),
      z.object({
        authMethod: z.literal("public-key"),
        username: z.string().trim().min(1),
        privateKey: z.string().trim().min(1).max(5000)
      }),
      z.object({ authMethod: z.literal("certificate"), username: z.string().trim().min(1) })
    ])
  }
} as const satisfies Partial<Record<PamAccountType, { connectionDetails: z.ZodTypeAny; credentials: z.ZodTypeAny }>>;

type TSupportedAccountType = keyof typeof ACCOUNT_TYPE_CONFIGS;

const getAccountTypeConfig = (accountType: PamAccountType) => {
  const config = ACCOUNT_TYPE_CONFIGS[accountType as TSupportedAccountType];
  if (!config) {
    throw new Error(`Account type '${accountType}' is not supported in this phase`);
  }
  return config;
};

export const validateConnectionDetails = (accountType: PamAccountType, data: unknown) => {
  return getAccountTypeConfig(accountType).connectionDetails.parse(data) as z.output<
    (typeof ACCOUNT_TYPE_CONFIGS)[TSupportedAccountType]["connectionDetails"]
  >;
};

export const validateCredentials = (accountType: PamAccountType, data: unknown) => {
  return getAccountTypeConfig(accountType).credentials.parse(data) as z.output<
    (typeof ACCOUNT_TYPE_CONFIGS)[TSupportedAccountType]["credentials"]
  >;
};

export { ACCOUNT_TYPE_CONFIGS };
