import { z } from "zod";

const CommandLogSchema = z.object({
  input: z.string(),
  output: z.string(),
  timestamp: z.string()
});

const SessionEventSchema = z.object({
  timestamp: z.string(),
  eventType: z.enum(["input", "output", "resize", "error"]),
  channelType: z.enum(["terminal", "exec", "sftp"]).optional(),
  data: z.string(),
  elapsedTime: z.number()
});

const HttpRequestEventSchema = z.object({
  timestamp: z.string(),
  requestId: z.string(),
  eventType: z.literal("request"),
  headers: z.record(z.array(z.string())),
  method: z.string(),
  url: z.string(),
  body: z.string().optional()
});

const HttpResponseEventSchema = z.object({
  timestamp: z.string(),
  requestId: z.string(),
  eventType: z.literal("response"),
  headers: z.record(z.array(z.string())),
  status: z.string(),
  body: z.string().optional()
});

const SessionLogSchema = z.union([
  CommandLogSchema,
  SessionEventSchema,
  HttpRequestEventSchema,
  HttpResponseEventSchema
]);

export const SessionLogsPageSchema = z.object({
  logs: z.array(SessionLogSchema),
  hasMore: z.boolean(),
  batchCount: z.number()
});

export type TSessionLogsPage = z.infer<typeof SessionLogsPageSchema>;
