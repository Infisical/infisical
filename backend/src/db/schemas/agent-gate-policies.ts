import { z } from "zod";

import { TImmutableDBKeys } from "./models";

export const PromptPolicySchema = z.object({
  id: z.string(),
  description: z.string(),
  prompt: z.string(),
  onActions: z.array(z.string()),
  enforce: z.enum(["llm", "log_only"])
});

export const SelfPoliciesSchema = z.object({
  allowedActions: z.array(z.string()),
  promptPolicies: z.array(PromptPolicySchema)
});

export const InboundPolicySchema = z.object({
  fromAgentId: z.string().optional(),
  allowedToRequest: z.array(z.string()),
  promptPolicies: z.array(PromptPolicySchema)
});

export const AgentGatePoliciesSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  agentId: z.string(),
  selfPolicies: SelfPoliciesSchema,
  inboundPolicies: z.array(InboundPolicySchema),
  createdAt: z.date(),
  updatedAt: z.date()
});

export type TAgentGatePolicies = z.infer<typeof AgentGatePoliciesSchema>;
export type TAgentGatePoliciesInsert = Omit<z.input<typeof AgentGatePoliciesSchema>, TImmutableDBKeys>;
export type TAgentGatePoliciesUpdate = Partial<Omit<z.input<typeof AgentGatePoliciesSchema>, TImmutableDBKeys>>;
export type TPromptPolicy = z.infer<typeof PromptPolicySchema>;
export type TSelfPolicies = z.infer<typeof SelfPoliciesSchema>;
export type TInboundPolicy = z.infer<typeof InboundPolicySchema>;
