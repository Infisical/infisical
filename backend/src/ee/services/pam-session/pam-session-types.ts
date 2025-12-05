import { z } from "zod";

import {
  HttpEventSchema,
  PamSessionCommandLogSchema,
  SanitizedSessionSchema,
  TerminalEventSchema
} from "./pam-session-schemas";

export type TPamSessionCommandLog = z.infer<typeof PamSessionCommandLogSchema>;
export type TTerminalEvent = z.infer<typeof TerminalEventSchema>;
export type THttpEvent = z.infer<typeof HttpEventSchema>;
export type TPamSanitizedSession = z.infer<typeof SanitizedSessionSchema>;

// DTOs
export type TUpdateSessionLogsDTO = {
  sessionId: string;
  logs: (TPamSessionCommandLog | TTerminalEvent | THttpEvent)[];
};
