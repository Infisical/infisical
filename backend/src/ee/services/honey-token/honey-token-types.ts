import { z } from "zod";

import { HoneyTokenEventType, HoneyTokenType } from "./honey-token-enums";

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

export type TAwsHoneyTokenEventMetadata = z.infer<typeof AwsHoneyTokenEventMetadataSchema>;

export const HoneyTokenEventMetadataSchema = z.discriminatedUnion("eventType", [
  z.object({
    eventType: z.literal(HoneyTokenEventType.AWS),
    metadata: AwsHoneyTokenEventMetadataSchema
  })
]);

export type THoneyTokenEventMetadata = z.infer<typeof HoneyTokenEventMetadataSchema>;

// --- Config schemas (typed shape for the encrypted config blob per provider) ---

export const AwsHoneyTokenConfigSchema = z.object({
  webhookSigningKey: z.string().min(1),
  stackName: z.string().min(1).max(128).default("infisical-honey-tokens"),
  awsRegion: z.string().min(1).default("us-east-1")
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
