import { z } from "zod";

import { TImmutableDBKeys } from "./models";

export const PolicyEvaluationResultSchema = z.object({
  allowed: z.boolean(),
  policyType: z.enum(["structured", "prompt"]),
  policyId: z.string(),
  reasoning: z.string(),
  evaluatedAt: z.string(),
  llmEvaluation: z
    .object({
      model: z.string(),
      promptTokens: z.number(),
      completionTokens: z.number(),
      reasoning: z.string()
    })
    .optional()
});

export const AgentGateAuditLogsSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().nullable().optional(),
  projectId: z.string().uuid(),
  timestamp: z.date(),
  requestingAgentId: z.string(),
  targetAgentId: z.string(),
  actionType: z.enum(["skill", "communication"]),
  action: z.string(),
  result: z.enum(["allowed", "denied"]),
  policyEvaluations: z.array(PolicyEvaluationResultSchema),
  context: z.record(z.unknown()).nullable().optional(),
  agentReasoning: z.string().nullable().optional(),
  executionStatus: z.enum(["pending", "started", "completed", "failed"]).nullable().optional(),
  executionResult: z.record(z.unknown()).nullable().optional(),
  executionError: z.string().nullable().optional(),
  executionStartedAt: z.date().nullable().optional(),
  executionCompletedAt: z.date().nullable().optional(),
  executionDurationMs: z.number().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date()
});

export type TAgentGateAuditLogs = z.infer<typeof AgentGateAuditLogsSchema>;
export type TAgentGateAuditLogsInsert = Omit<z.input<typeof AgentGateAuditLogsSchema>, TImmutableDBKeys>;
export type TAgentGateAuditLogsUpdate = Partial<Omit<z.input<typeof AgentGateAuditLogsSchema>, TImmutableDBKeys>>;
export type TPolicyEvaluationResult = z.infer<typeof PolicyEvaluationResultSchema>;
