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

  [PamAccountType.MySQL]: {
    connectionDetails: z.object({
      host: z.string().trim().min(1).max(255),
      port: z.coerce.number(),
      database: z
        .string()
        .trim()
        .min(1)
        .max(255)
        .transform((v) => v || undefined)
        .optional(),
      sslEnabled: z.boolean(),
      sslRejectUnauthorized: z.boolean(),
      sslCertificate: z
        .string()
        .trim()
        .transform((v) => v || undefined)
        .optional()
    }),
    credentials: z.object({
      username: z.string().trim().min(1).max(32),
      password: z.string().trim().min(1).max(80)
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
    ]),
    internalMetadata: z.object({
      caPrivateKey: z.string(),
      caPublicKey: z.string(),
      caKeyAlgorithm: z.string()
    })
  }
} as const satisfies Partial<
  Record<
    PamAccountType,
    { connectionDetails: z.ZodTypeAny; credentials: z.ZodTypeAny; internalMetadata?: z.ZodTypeAny }
  >
>;

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

export type TGatewayTarget = { host: string; port?: number };

export const extractGatewayTarget = (
  accountType: PamAccountType,
  rawConnectionDetails: Record<string, unknown>
): TGatewayTarget => {
  const validated = validateConnectionDetails(accountType, rawConnectionDetails);

  switch (accountType) {
    case PamAccountType.SSH:
    case PamAccountType.Postgres:
    case PamAccountType.MySQL:
      return {
        host: (validated as { host: string; port: number }).host,
        port: (validated as { host: string; port: number }).port
      };
    default:
      throw new Error(`No gateway target extraction defined for account type '${accountType}'`);
  }
};

export type TSshInternalMetadata = z.infer<(typeof ACCOUNT_TYPE_CONFIGS)[PamAccountType.SSH]["internalMetadata"]>;

export const parseInternalMetadata = (accountType: PamAccountType, data: unknown): TSshInternalMetadata | null => {
  if (accountType === PamAccountType.SSH) {
    const result = ACCOUNT_TYPE_CONFIGS[PamAccountType.SSH].internalMetadata.safeParse(data);
    return result.success ? result.data : null;
  }
  return null;
};
