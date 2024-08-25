import { z } from "zod";

export enum SqlProviders {
  Postgres = "postgres",
  MySQL = "mysql2",
  Oracle = "oracledb",
  MsSQL = "mssql"
}

export const DynamicSecretRedisDBSchema = z.object({
  host: z.string().trim().toLowerCase(),
  port: z.number(),
  username: z.string().trim(), // this is often "default".
  password: z.string().trim().optional(),

  creationStatement: z.string().trim(),
  revocationStatement: z.string().trim(),
  renewStatement: z.string().trim().optional(),
  ca: z.string().optional()
});

export const DynamicSecretAwsElastiCacheSchema = z.object({
  clusterName: z.string().trim().min(1),
  accessKeyId: z.string().trim().min(1),
  secretAccessKey: z.string().trim().min(1),

  region: z.string().trim(),
  creationStatement: z.string().trim(),
  revocationStatement: z.string().trim(),
  ca: z.string().optional()
});

export const DynamicSecretSqlDBSchema = z.object({
  client: z.nativeEnum(SqlProviders),
  host: z.string().trim().toLowerCase(),
  port: z.number(),
  database: z.string().trim(),
  username: z.string().trim(),
  password: z.string().trim(),
  creationStatement: z.string().trim(),
  revocationStatement: z.string().trim(),
  renewStatement: z.string().trim().optional(),
  ca: z.string().optional()
});

export const DynamicSecretCassandraSchema = z.object({
  host: z.string().trim().toLowerCase(),
  port: z.number(),
  localDataCenter: z.string().trim().min(1),
  keyspace: z.string().trim().optional(),
  username: z.string().trim(),
  password: z.string().trim(),
  creationStatement: z.string().trim(),
  revocationStatement: z.string().trim(),
  renewStatement: z.string().trim().optional(),
  ca: z.string().optional()
});

export const DynamicSecretAwsIamSchema = z.object({
  accessKey: z.string().trim().min(1),
  secretAccessKey: z.string().trim().min(1),
  region: z.string().trim().min(1),
  awsPath: z.string().trim().optional(),
  permissionBoundaryPolicyArn: z.string().trim().optional(),
  policyDocument: z.string().trim().optional(),
  userGroups: z.string().trim().optional(),
  policyArns: z.string().trim().optional()
});

export enum DynamicSecretProviders {
  SqlDatabase = "sql-database",
  Cassandra = "cassandra",
  AwsIam = "aws-iam",
  Redis = "redis",
  AwsElastiCache = "aws-elasticache"
}

export const DynamicSecretProviderSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal(DynamicSecretProviders.SqlDatabase), inputs: DynamicSecretSqlDBSchema }),
  z.object({ type: z.literal(DynamicSecretProviders.Cassandra), inputs: DynamicSecretCassandraSchema }),
  z.object({ type: z.literal(DynamicSecretProviders.AwsIam), inputs: DynamicSecretAwsIamSchema }),
  z.object({ type: z.literal(DynamicSecretProviders.Redis), inputs: DynamicSecretRedisDBSchema }),
  z.object({ type: z.literal(DynamicSecretProviders.AwsElastiCache), inputs: DynamicSecretAwsElastiCacheSchema })
]);

export type TDynamicProviderFns = {
  create: (inputs: unknown, expireAt: number) => Promise<{ entityId: string; data: unknown }>;
  validateConnection: (inputs: unknown) => Promise<boolean>;
  validateProviderInputs: (inputs: object) => Promise<unknown>;
  revoke: (inputs: unknown, entityId: string) => Promise<{ entityId: string }>;
  renew: (inputs: unknown, entityId: string, expireAt: number) => Promise<{ entityId: string }>;
};
