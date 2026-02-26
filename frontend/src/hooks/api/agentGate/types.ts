export type TPromptPolicy = {
  id: string;
  description: string;
  prompt: string;
  onActions: string[];
  enforce: "llm" | "log_only";
};

export type TSelfPolicies = {
  allowedActions: string[];
  promptPolicies: TPromptPolicy[];
};

export type TInboundPolicy = {
  fromAgentId?: string;
  allowedToRequest: string[];
  promptPolicies: TPromptPolicy[];
};

export type TAgentGatePolicy = {
  id: string;
  projectId: string;
  agentId: string;
  selfPolicies: TSelfPolicies;
  inboundPolicies: TInboundPolicy[];
  createdAt: string;
  updatedAt: string;
};

export type TListAgentGatePoliciesDTO = {
  projectId: string;
};

export type TGetAgentPolicyDTO = {
  agentId: string;
  projectId: string;
};

export type TUpdateAgentPolicyDTO = {
  agentId: string;
  projectId: string;
  selfPolicies?: TSelfPolicies;
  inboundPolicies?: TInboundPolicy[];
};

export type TPolicyEvaluation = {
  allowed: boolean;
  policyType: "structured" | "prompt";
  policyId: string;
  reasoning: string;
  evaluatedAt: string;
  llmEvaluation?: {
    model: string;
    promptTokens: number;
    completionTokens: number;
    reasoning: string;
  };
};

export type TAgentGateAuditLog = {
  id: string;
  sessionId: string | null;
  projectId: string;
  timestamp: string;
  requestingAgentId: string;
  targetAgentId: string;
  actionType: "skill" | "communication";
  action: string;
  result: "allowed" | "denied";
  policyEvaluations: TPolicyEvaluation[];
  agentReasoning: string | null;
  executionStatus: "pending" | "started" | "completed" | "failed" | null;
  context: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type TQueryAuditLogsDTO = {
  projectId: string;
  limit?: number;
  offset?: number;
  startTime?: string;
  sessionId?: string;
};
