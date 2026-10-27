import { z } from "zod";

import { HONEY_TOKENS } from "@app/lib/api-docs";
import { isValidAwsRegion } from "@app/lib/aws/region";
import { slugSchema } from "@app/server/lib/schemas";

import { HoneyTokenHosting, HoneyTokenType } from "./honey-token-enums";

// The per-token honey_tokens.config column, not the org-level honey_token_configs row (AwsHoneyTokenConfigSchema).
export const AwsHoneyTokenRowConfigSchema = z.object({
  hosting: z.nativeEnum(HoneyTokenHosting).describe(HONEY_TOKENS.CONFIG.hosting)
});

export type TAwsHoneyTokenRowConfig = z.infer<typeof AwsHoneyTokenRowConfigSchema>;

export const getHoneyTokenConfig = (honeyToken: { config?: unknown }) =>
  AwsHoneyTokenRowConfigSchema.parse(honeyToken.config);

export const getHoneyTokenHosting = (honeyToken: { config?: unknown }) => getHoneyTokenConfig(honeyToken).hosting;

export const AwsHoneyTokenEventMetadataSchema = z.object({
  accessKeyId: z.string(),
  eventName: z.string(),
  eventTime: z.string(),
  awsRegion: z.string(),
  sourceIp: z.string().nullable().optional(),
  userAgent: z.string().nullable().optional(),
  username: z.string().nullable().optional(),
  eventSource: z.string().nullable().optional(),
  accountId: z.string().nullable().optional(),
  errorCode: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  eventId: z.string().nullable().optional(),
  requestParameters: z.unknown().nullable().optional()
});

export const HoneyTokenWebhookPayloadSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal(HoneyTokenType.AWS),
    event: AwsHoneyTokenEventMetadataSchema.optional()
  })
]);

export type THoneyTokenWebhookPayload = z.infer<typeof HoneyTokenWebhookPayloadSchema>;

// --- Config schemas (typed shape for the encrypted config blob per provider) ---

export const AwsHoneyTokenConfigSchema = z.object({
  webhookSigningKey: z
    .string()
    .min(1)
    .regex(/^[a-fA-F0-9]+$/, "Signing key must be a hex string"),
  stackName: slugSchema({ max: 128, field: "stackName" }).default("infisical-honey-tokens"),
  awsRegion: z.string().min(1).default("us-east-1").refine(isValidAwsRegion, "Invalid AWS region")
});

export type TAwsHoneyTokenConfig = z.infer<typeof AwsHoneyTokenConfigSchema>;
export type TAwsHoneyTokenConfigInput = z.input<typeof AwsHoneyTokenConfigSchema>;

export const HoneyTokenConfigSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal(HoneyTokenType.AWS),
    config: AwsHoneyTokenConfigSchema
  })
]);

export type THoneyTokenConfig = z.infer<typeof HoneyTokenConfigSchema>;

export type THoneyTokenEventsInput = {
  honeyTokenId: string;
  offset?: number;
  limit?: number;
};
