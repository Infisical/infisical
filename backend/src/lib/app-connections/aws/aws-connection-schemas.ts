import { z } from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { slugSchema } from "@app/server/lib/schemas";
import { BaseAppConnectionSchema } from "@app/services/app-connection/app-connection-schemas";

import { AppConnection } from "../app-connection-enums";
import { AwsConnectionMethod } from "./aws-connection-enums";

export const AwsConnectionAssumeRoleCredentialsSchema = z.object({
  roleArn: z.string().min(1, "Role ARN required")
});

export const AwsConnectionAccessTokenCredentialsSchema = z.object({
  accessKeyId: z.string().min(1, "Access Key ID required"),
  secretAccessKey: z.string().min(1, "Secret Access Key required")
});

const BaseAwsConnectionSchema = BaseAppConnectionSchema.extend({ app: z.literal(AppConnection.AWS) });

export const AwsConnectionSchema = z.intersection(
  BaseAwsConnectionSchema,
  z.discriminatedUnion("method", [
    z.object({
      method: z.literal(AwsConnectionMethod.AssumeRole),
      credentials: AwsConnectionAssumeRoleCredentialsSchema
    }),
    z.object({
      method: z.literal(AwsConnectionMethod.AccessKey),
      credentials: AwsConnectionAccessTokenCredentialsSchema
    })
  ])
);

export const SanitizedAwsConnectionSchema = z.discriminatedUnion("method", [
  BaseAwsConnectionSchema.extend({
    method: z.literal(AwsConnectionMethod.AssumeRole),
    credentials: AwsConnectionAssumeRoleCredentialsSchema.omit({ roleArn: true })
  }),
  BaseAwsConnectionSchema.extend({
    method: z.literal(AwsConnectionMethod.AccessKey),
    credentials: AwsConnectionAccessTokenCredentialsSchema.omit({ secretAccessKey: true })
  })
]);

export const CreateAwsConnectionSchema = z
  .discriminatedUnion("method", [
    z.object({
      method: z.literal(AwsConnectionMethod.AssumeRole).describe(AppConnections.CREATE(AppConnection.AWS).method),
      credentials: AwsConnectionAssumeRoleCredentialsSchema.describe(
        AppConnections.CREATE(AppConnection.AWS).credentials
      )
    }),
    z.object({
      method: z.literal(AwsConnectionMethod.AccessKey).describe(AppConnections.CREATE(AppConnection.AWS).method),
      credentials: AwsConnectionAccessTokenCredentialsSchema.describe(
        AppConnections.CREATE(AppConnection.AWS).credentials
      )
    })
  ])
  .and(z.object({ name: slugSchema({ field: "name" }).describe(AppConnections.CREATE(AppConnection.AWS).name) }));

export const UpdateAwsConnectionSchema = z.object({
  name: slugSchema({ field: "name" }).optional().describe(AppConnections.UPDATE(AppConnection.AWS).name),
  credentials: z
    .union([AwsConnectionAccessTokenCredentialsSchema, AwsConnectionAssumeRoleCredentialsSchema])
    .optional()
    .describe(AppConnections.UPDATE(AppConnection.AWS).credentials)
});
