import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { BitBucketConnectionMethod } from "./bitbucket-connection-enums";

export const BitBucketConnectionAccessTokenCredentialsSchema = z.object({
  apiToken: z.string().trim().min(1, "API Token required").describe(AppConnections.CREDENTIALS.BITBUCKET.apiToken),
  email: z.string().email().trim().min(1, "Email required").describe(AppConnections.CREDENTIALS.BITBUCKET.email)
});

const BaseBitBucketConnectionSchema = BaseAppConnectionSchema.extend({ app: z.literal(AppConnection.BitBucket) });

export const BitBucketConnectionSchema = BaseBitBucketConnectionSchema.extend({
  method: z.literal(BitBucketConnectionMethod.ApiToken),
  credentials: BitBucketConnectionAccessTokenCredentialsSchema
});

export const SanitizedBitBucketConnectionSchema = z.discriminatedUnion("method", [
  BaseBitBucketConnectionSchema.extend({
    method: z.literal(BitBucketConnectionMethod.ApiToken),
    credentials: BitBucketConnectionAccessTokenCredentialsSchema.pick({
      email: true
    })
  })
]);

export const ValidateBitBucketConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z
      .literal(BitBucketConnectionMethod.ApiToken)
      .describe(AppConnections.CREATE(AppConnection.BitBucket).method),
    credentials: BitBucketConnectionAccessTokenCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.BitBucket).credentials
    )
  })
]);

export const CreateBitBucketConnectionSchema = ValidateBitBucketConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.BitBucket)
);

export const UpdateBitBucketConnectionSchema = z
  .object({
    credentials: BitBucketConnectionAccessTokenCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.BitBucket).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.BitBucket));

export const BitBucketConnectionListItemSchema = z.object({
  name: z.literal("BitBucket"),
  app: z.literal(AppConnection.BitBucket),
  methods: z.nativeEnum(BitBucketConnectionMethod).array()
});
