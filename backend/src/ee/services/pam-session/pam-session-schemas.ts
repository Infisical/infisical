import { z } from "zod";

import { PamSessionsSchema } from "@app/db/schemas";

export const PamSessionCommandLogSchema = z.object({
  input: z.string(),
  output: z.string(),
  timestamp: z.coerce.date()
});

export const SanitizedSessionSchema = PamSessionsSchema.omit({
  encryptedLogsBlob: true
}).extend({
  commandLogs: PamSessionCommandLogSchema.array()
});
