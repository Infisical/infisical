import { z } from "zod";

import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { AwsConnectionMethod } from "@app/hooks/api/appConnections/types/aws-connection";
import { GitHubConnectionMethod } from "@app/hooks/api/appConnections/types/github-connection";
import { PostgresConnectionMethod } from "@app/hooks/api/appConnections/types/postgres-connection";

import { slugSchema } from "./slugSchema";

export const rotationSchema = z.object({
  rotationInterval: z
    .number()
    .min(1)
    .max(365 * 2.5),
  rotateAtUtc: z.object({
    hours: z.number().min(0).max(23),
    minutes: z.number().min(0).max(59)
  })
});

export const genericAppConnectionFieldsSchema = z.object({
  name: slugSchema({ min: 1, max: 64, field: "Name" }),
  description: z.string().trim().max(256, "Description cannot exceed 256 characters").nullish(),
  gatewayId: z
    .string()
    .nullish()
    .transform((v) => (v === "" ? null : v)),
  gatewayPoolId: z
    .string()
    .nullish()
    .transform((v) => (v === "" ? null : v)),
  isAutoRotationEnabled: z.boolean().optional(),
  rotation: rotationSchema.optional()
});

export const BaseSqlUsernameAndPasswordConnectionSchema = z.object({
  host: z.string().trim().min(1, "Host required"),
  port: z.coerce.number().default(5432),
  database: z.string().trim().min(1, "Database required").default("default"),
  username: z.string().trim().min(1, "Username required"),
  password: z.string().trim().min(1, "Password required"),
  sslEnabled: z.boolean().default(true),
  sslRejectUnauthorized: z.boolean().default(true),
  sslCertificate: z
    .string()
    .trim()
    .transform((value) => value || undefined)
    .optional()
});

const awsRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.AWS)
});

export const awsConnectionFormSchema = z.discriminatedUnion("method", [
  awsRootSchema.extend({
    method: z.literal(AwsConnectionMethod.AssumeRole),
    credentials: z.object({
      roleArn: z.string().trim().min(1, "Role ARN required"),
      stsEndpoint: z
        .string()
        .trim()
        .url("Must be a valid URL")
        .startsWith("https://", "Must use HTTPS")
        .or(z.literal(""))
        .optional()
        .transform((val) => val || undefined)
    })
  }),
  awsRootSchema.extend({
    method: z.literal(AwsConnectionMethod.AccessKey),
    credentials: z.object({
      accessKeyId: z.string().trim().min(1, "Access Key ID required"),
      secretAccessKey: z.string().trim().min(1, "Secret Access Key required")
    })
  })
]);

const gitHubRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.GitHub),
  method: z.nativeEnum(GitHubConnectionMethod)
});

const gitHubBaseCredentialsSchema = z.union([
  z.object({
    instanceType: z.literal("server"),
    host: z.string().min(1, "Host is required for server instance type")
  }),
  z.object({
    instanceType: z.literal("cloud").optional(),
    host: z.string().optional()
  })
]);

const gitHubAppSchema = gitHubRootSchema.extend({
  method: z.literal(GitHubConnectionMethod.App),
  credentials: gitHubBaseCredentialsSchema
});

const gitHubOAuthSchema = gitHubRootSchema.extend({
  method: z.literal(GitHubConnectionMethod.OAuth),
  credentials: gitHubBaseCredentialsSchema
});

export const gitHubPatConnectionFormSchema = gitHubRootSchema.extend({
  method: z.literal(GitHubConnectionMethod.Pat),
  credentials: z.union([
    z.object({
      instanceType: z.literal("server"),
      host: z.string().min(1, "Host is required for server instance type"),
      personalAccessToken: z.string().min(1, "Personal Access Token is required")
    }),
    z.object({
      instanceType: z.literal("cloud").optional(),
      host: z.string().optional(),
      personalAccessToken: z.string().min(1, "Personal Access Token is required")
    })
  ])
});

export const gitHubConnectionFormSchema = z.discriminatedUnion("method", [
  gitHubAppSchema,
  gitHubOAuthSchema,
  gitHubPatConnectionFormSchema
]);

const postgresRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.Postgres),
  isPlatformManagedCredentials: z.boolean().optional()
});

export const postgresConnectionFormSchema = z.discriminatedUnion("method", [
  postgresRootSchema.extend({
    method: z.literal(PostgresConnectionMethod.UsernameAndPassword),
    credentials: BaseSqlUsernameAndPasswordConnectionSchema
  })
]);
