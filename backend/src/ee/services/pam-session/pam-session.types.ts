import { z } from "zod";

import { PamSessionCommandLogSchema, SanitizedSessionSchema } from "./pam-session-schemas";

export type TPamSessionCommandLog = z.infer<typeof PamSessionCommandLogSchema>;
export type TPamSanitizedSession = z.infer<typeof SanitizedSessionSchema>;

// DTOs
export type TUpdateSessionLogsDTO = {
  sessionId: string;
  logs: TPamSessionCommandLog[];
};
