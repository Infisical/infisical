import { z } from "zod";

import { PamSessionsSchema } from "@app/db/schemas";

import { SessionChannelType } from "./pam-session-enums";

export const PamSessionCommandLogSchema = z.object({
  input: z.string(),
  output: z.string(),
  timestamp: z.coerce.date()
});

// "rdp" events carry a JSON envelope in `data` (target_frame / keyboard / unicode / mouse).
export const SessionEventTypeSchema = z.enum(["input", "output", "resize", "error", "rdp"]);

export const SessionChannelTypeSchema = z.nativeEnum(SessionChannelType);

export const HttpEventTypeSchema = z.enum(["request", "response"]);

export const SessionEventSchema = z.object({
  timestamp: z.coerce.date(),
  eventType: SessionEventTypeSchema,
  channelType: SessionChannelTypeSchema.optional(), // Optional for backwards compatibility with existing logs
  data: z.string(), // Base64 encoded binary data
  elapsedTime: z.number() // Seconds since session start (for replay)
});

export const HttpBaseEventSchema = z.object({
  timestamp: z.coerce.date(),
  requestId: z.string(),
  eventType: SessionEventTypeSchema,
  headers: z.record(z.string(), z.array(z.string())),
  body: z.string().optional()
});

export const HttpRequestEventSchema = HttpBaseEventSchema.extend({
  eventType: z.literal(HttpEventTypeSchema.Values.request),
  method: z.string(),
  url: z.string()
});

export const HttpResponseEventSchema = HttpBaseEventSchema.extend({
  eventType: z.literal(HttpEventTypeSchema.Values.response),
  status: z.string()
});

export const HttpEventSchema = z.discriminatedUnion("eventType", [HttpRequestEventSchema, HttpResponseEventSchema]);

export const AiInsightsSchema = z
  .object({
    summary: z.string(),
    warnings: z.array(z.object({ text: z.string(), logIndex: z.number().int().optional() }))
  })
  .nullable()
  .optional();

const SessionInternalFieldsOmit = {
  encryptedLogsBlob: true,
  encryptedAiInsights: true,
  encryptedSessionKey: true,
  gatewayUploadTokenHash: true
} as const;

export const SanitizedSessionSchema = PamSessionsSchema.omit(SessionInternalFieldsOmit).extend({
  logs: z.array(z.union([PamSessionCommandLogSchema, HttpEventSchema, SessionEventSchema])),
  gatewayIdentityId: z.string().nullable().optional(),
  gatewayId: z.string().nullable().optional(),
  aiInsights: AiInsightsSchema
});

export const SanitizedSessionListItemSchema = PamSessionsSchema.omit(SessionInternalFieldsOmit).extend({
  gatewayIdentityId: z.string().nullable().optional(),
  gatewayId: z.string().nullable().optional()
});

export const SessionLogsPageSchema = z.object({
  logs: z.array(z.union([PamSessionCommandLogSchema, SessionEventSchema, HttpEventSchema])),
  hasMore: z.boolean(),
  batchCount: z.number()
});
