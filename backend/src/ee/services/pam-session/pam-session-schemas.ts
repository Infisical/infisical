import { z } from "zod";

import { PamSessionsSchema } from "@app/db/schemas";

export const PamSessionCommandLogSchema = z.object({
  input: z.string(),
  output: z.string(),
  timestamp: z.coerce.date()
});

// SSH Terminal Event schemas
export const TerminalEventTypeSchema = z.enum(["input", "output", "resize", "error"]);

export const HttpEventTypeSchema = z.enum(["request", "response"]);

export const TerminalEventSchema = z.object({
  timestamp: z.coerce.date(),
  eventType: TerminalEventTypeSchema,
  data: z.string(), // Base64 encoded binary data
  elapsedTime: z.number() // Seconds since session start (for replay)
});

export const HttpBaseEventSchema = z.object({
  timestamp: z.coerce.date(),
  requestId: z.string(),
  eventType: TerminalEventTypeSchema,
  headers: z.record(z.string(), z.string())
});

export const HttpRequestEventSchema = HttpBaseEventSchema.extend({
  eventType: z.literal(HttpEventTypeSchema.Values.request),
  method: z.string(),
  url: z.string(),
  body: z.string()
});

export const HttpResponseEventSchema = HttpBaseEventSchema.extend({
  eventType: z.literal(HttpEventTypeSchema.Values.response),
  status: z.string(),
  body: z.string()
});

export const HttpEventSchema = z.discriminatedUnion("eventType", [HttpRequestEventSchema, HttpResponseEventSchema]);

export const SanitizedSessionSchema = PamSessionsSchema.omit({
  encryptedLogsBlob: true
}).extend({
  logs: z.array(z.union([PamSessionCommandLogSchema, TerminalEventSchema, HttpEventSchema]))
});
