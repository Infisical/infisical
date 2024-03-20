import { z } from "zod";

export enum SqlProviders {
  Postgres = "postgres"
}

export const DynamicSecretSqlDBSchema = z.object({
  client: z.nativeEnum(SqlProviders),
  host: z.string().toLowerCase(),
  port: z.number(),
  database: z.string(),
  username: z.string(),
  password: z.string(),
  creationStatement: z.string(),
  revocationStatement: z.string(),
  renewStatement: z.string(),
  ca: z.string().optional()
});

export enum DynamicSecretProviders {
  SqlDatabase = "sql-database"
}

export const DynamicSecretProviderSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal(DynamicSecretProviders.SqlDatabase), inputs: DynamicSecretSqlDBSchema })
]);

export type TDynamicProviderFns = {
  create: (inputs: unknown, expireAt: number) => Promise<{ entityId: string; data: unknown }>;
  validateProviderInputs: (inputs: object) => Promise<unknown>;
  revoke: (inputs: unknown, entityId: string) => Promise<{ entityId: string }>;
  renew: (inputs: unknown, entityId: string, expireAt: number) => Promise<{ entityId: string }>;
};
