import { z } from "zod";

import { PamSessionsSchema } from "@app/db/schemas";

export const PamSessionCommandLogSchema = z.object({
  input: z.string(),
  output: z.string(),
  timestamp: z.coerce.date()
});

// SSH Terminal Event schemas
export const TerminalEventTypeSchema = z.enum(["input", "output", "resize", "error"]);

export const TerminalEventSchema = z.object({
  timestamp: z.coerce.date(),
  eventType: TerminalEventTypeSchema,
  data: z.string(), // Base64 encoded binary data
  elapsedTime: z.number() // Seconds since session start (for replay)
});

export const SanitizedSessionSchema = PamSessionsSchema.omit({
  encryptedLogsBlob: true
}).extend({
  logs: z.array(z.union([PamSessionCommandLogSchema, TerminalEventSchema]))
});
