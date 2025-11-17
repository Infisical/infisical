import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { BitbucketConnectionMethod } from "./bitbucket-connection-enums";

export const BitbucketConnectionAccessTokenCredentialsSchema = z.object({
  apiToken: z
    .string()
    .trim()
    .min(1, "API Token required")
    .max(255)
    .describe(AppConnections.CREDENTIALS.BITBUCKET.apiToken),
  email: z
    .string()
    .email()
    .trim()
    .min(1, "Email required")
    .max(255)
    .describe(AppConnections.CREDENTIALS.BITBUCKET.email)
});

const BaseBitbucketConnectionSchema = BaseAppConnectionSchema.extend({ app: z.literal(AppConnection.Bitbucket) });

export const BitbucketConnectionSchema = BaseBitbucketConnectionSchema.extend({
  method: z.literal(BitbucketConnectionMethod.ApiToken),
  credentials: BitbucketConnectionAccessTokenCredentialsSchema
});

export const SanitizedBitbucketConnectionSchema = z.discriminatedUnion("method", [
  BaseBitbucketConnectionSchema.extend({
    method: z.literal(BitbucketConnectionMethod.ApiToken),
    credentials: BitbucketConnectionAccessTokenCredentialsSchema.pick({
      email: true
    })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.Bitbucket]} (API Token)` }))
]);

export const ValidateBitbucketConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z
      .literal(BitbucketConnectionMethod.ApiToken)
      .describe(AppConnections.CREATE(AppConnection.Bitbucket).method),
    credentials: BitbucketConnectionAccessTokenCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.Bitbucket).credentials
    )
  })
]);

export const CreateBitbucketConnectionSchema = ValidateBitbucketConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.Bitbucket)
);

export const UpdateBitbucketConnectionSchema = z
  .object({
    credentials: BitbucketConnectionAccessTokenCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.Bitbucket).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.Bitbucket));

export const BitbucketConnectionListItemSchema = z
  .object({
    name: z.literal("Bitbucket"),
    app: z.literal(AppConnection.Bitbucket),
    methods: z.nativeEnum(BitbucketConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.Bitbucket] }));
