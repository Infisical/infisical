import { z } from "zod";

import { TImmutableDBKeys } from "./models";

export const AgentGateExecutionsSchema = z.object({
  id: z.string().uuid(),
  executionId: z.string(),
  sessionId: z.string().nullable().optional(),
  projectId: z.string().uuid(),
  requestingAgentId: z.string(),
  targetAgentId: z.string(),
  actionType: z.enum(["skill", "communication"]),
  action: z.string(),
  status: z.enum(["pending", "started", "completed", "failed"]),
  parameters: z.record(z.unknown()).nullable().optional(),
  context: z.record(z.unknown()).nullable().optional(),
  result: z.record(z.unknown()).nullable().optional(),
  error: z.string().nullable().optional(),
  startedAt: z.date().nullable().optional(),
  completedAt: z.date().nullable().optional(),
  durationMs: z.number().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date()
});

export type TAgentGateExecutions = z.infer<typeof AgentGateExecutionsSchema>;
export type TAgentGateExecutionsInsert = Omit<z.input<typeof AgentGateExecutionsSchema>, TImmutableDBKeys>;
export type TAgentGateExecutionsUpdate = Partial<Omit<z.input<typeof AgentGateExecutionsSchema>, TImmutableDBKeys>>;
