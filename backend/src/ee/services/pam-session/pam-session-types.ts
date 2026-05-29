import { z } from "zod";

import {
  HttpEventSchema,
  PamSessionCommandLogSchema,
  SanitizedSessionSchema,
  SessionEventSchema
} from "./pam-session-schemas";

export type TPamSessionCommandLog = z.infer<typeof PamSessionCommandLogSchema>;
export type TSessionEvent = z.infer<typeof SessionEventSchema>;
export type THttpEvent = z.infer<typeof HttpEventSchema>;
export type TPamSanitizedSession = z.infer<typeof SanitizedSessionSchema>;

// DTOs
export type TUpdateSessionLogsDTO = {
  sessionId: string;
  logs: (TPamSessionCommandLog | TSessionEvent | THttpEvent)[];
};

export type TUploadEventBatchDTO = {
  sessionId: string;
  startOffset: number;
  events: Buffer;
};
