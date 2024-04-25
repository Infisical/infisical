import { z } from "zod";

export enum SqlProviders {
  Postgres = "postgres",
  MySQL = "mysql2",
  Oracle = "oracledb"
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
  renewStatement: z.string().optional(),
  ca: z.string().optional()
});

export const DynamicSecretCassandraSchema = z.object({
  host: z.string().toLowerCase(),
  port: z.number(),
  localDataCenter: z.string().min(1),
  keyspace: z.string().optional(),
  username: z.string(),
  password: z.string(),
  creationStatement: z.string(),
  revocationStatement: z.string(),
  renewStatement: z.string().optional(),
  ca: z.string().optional()
});

export enum DynamicSecretProviders {
  SqlDatabase = "sql-database",
  Cassandra = "cassandra"
}

export const DynamicSecretProviderSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal(DynamicSecretProviders.SqlDatabase), inputs: DynamicSecretSqlDBSchema }),
  z.object({ type: z.literal(DynamicSecretProviders.Cassandra), inputs: DynamicSecretCassandraSchema })
]);

export type TDynamicProviderFns = {
  create: (inputs: unknown, expireAt: number) => Promise<{ entityId: string; data: unknown }>;
  validateConnection: (inputs: unknown) => Promise<boolean>;
  validateProviderInputs: (inputs: object) => Promise<unknown>;
  revoke: (inputs: unknown, entityId: string) => Promise<{ entityId: string }>;
  renew: (inputs: unknown, entityId: string, expireAt: number) => Promise<{ entityId: string }>;
};
