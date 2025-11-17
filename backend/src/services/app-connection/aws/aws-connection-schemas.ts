import { z } from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { AwsConnectionMethod } from "./aws-connection-enums";

export const AwsConnectionAssumeRoleCredentialsSchema = z.object({
  roleArn: z.string().trim().min(1, "Role ARN required")
});

export const AwsConnectionAccessTokenCredentialsSchema = z.object({
  accessKeyId: z.string().trim().min(1, "Access Key ID required"),
  secretAccessKey: z.string().trim().min(1, "Secret Access Key required")
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
    credentials: AwsConnectionAssumeRoleCredentialsSchema.pick({})
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.AWS]} (Assume Role)` })),
  BaseAwsConnectionSchema.extend({
    method: z.literal(AwsConnectionMethod.AccessKey),
    credentials: AwsConnectionAccessTokenCredentialsSchema.pick({ accessKeyId: true })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.AWS]} (Access Key)` }))
]);

export const ValidateAwsConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal(AwsConnectionMethod.AssumeRole).describe(AppConnections.CREATE(AppConnection.AWS).method),
    credentials: AwsConnectionAssumeRoleCredentialsSchema.describe(AppConnections.CREATE(AppConnection.AWS).credentials)
  }),
  z.object({
    method: z.literal(AwsConnectionMethod.AccessKey).describe(AppConnections.CREATE(AppConnection.AWS).method),
    credentials: AwsConnectionAccessTokenCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.AWS).credentials
    )
  })
]);

export const CreateAwsConnectionSchema = ValidateAwsConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.AWS)
);

export const UpdateAwsConnectionSchema = z
  .object({
    credentials: z
      .union([AwsConnectionAccessTokenCredentialsSchema, AwsConnectionAssumeRoleCredentialsSchema])
      .optional()
      .describe(AppConnections.UPDATE(AppConnection.AWS).credentials)
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.AWS));

export const AwsConnectionListItemSchema = z
  .object({
    name: z.literal("AWS"),
    app: z.literal(AppConnection.AWS),
    // the below is preferable but currently breaks with our zod to json schema parser
    // methods: z.tuple([z.literal(AwsConnectionMethod.AssumeRole), z.literal(AwsConnectionMethod.AccessKey)]),
    methods: z.nativeEnum(AwsConnectionMethod).array(),
    accessKeyId: z.string().optional()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.AWS] }));
