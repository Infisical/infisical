export interface PolicyEvaluationRequest {
  requestingAgentId: string; // Who is asking
  targetAgentId: string; // Who is being asked (for skills, same as requesting)
  action: SkillInvocationRequest | CommunicationRequest;
  context: ActionContext;
}

export interface SkillInvocationRequest {
  type: "skill";
  skillId: string;
  parameters: Record<string, unknown>;
}

export interface CommunicationRequest {
  type: "communication";
  messageType: string;
  content: Record<string, unknown>;
}

export interface ActionContext {
  sessionId?: string; // Tracks all events across agents for a single workflow
  taskId?: string;
  ticketId?: string;
  orderId?: string;
  customerId?: string;
  customerEmail?: string;
  issueCategory?: "billing" | "shipping" | "product" | "account" | "other";
  issueSeverity?: "low" | "medium" | "high" | "critical";
  customerLoyaltyStatus?: "standard" | "silver" | "gold" | "platinum";
  daysSinceTicketCreated?: number;
  refundAmount?: number;
  hasEscalationApproval?: boolean;
  escalationApprovalContext?: {
    approvedBy: string;
    approvedAmount: number;
    approvedAt: string;
  };
  additionalContext?: Record<string, unknown>;
}

export interface PolicyEvaluationResult {
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
}

/**
 * Policy defined FROM the perspective of the agent being governed.
 * "These are the rules for how others can interact with ME"
 */
export interface AgentPolicy {
  agentId: string;

  // Policies for when THIS agent executes its own skills (self-governance)
  selfPolicies: {
    allowedActions: string[];
    promptPolicies: PromptPolicy[];
  };

  // Policies for how OTHER agents can interact with this agent
  inboundPolicies: InboundAgentPolicy[];
}

/**
 * Defines what a specific agent can ask THIS agent to do
 */
export interface InboundAgentPolicy {
  fromAgentId: string; // Specific agent ID (use "*" for any agent)
  allowedToRequest: string[]; // What actions they can ask me to perform
  promptPolicies: PromptPolicy[];
}

export interface PromptPolicy {
  id: string;
  description: string;
  prompt: string;
  onActions: string[];
  enforce: "llm" | "log_only";
}

export interface GovernanceAuditLog {
  id: string;
  sessionId?: string; // Links all events in a workflow
  timestamp: string;
  requestingAgentId: string;
  targetAgentId: string;
  actionType: "skill" | "communication";
  action: string;
  result: "allowed" | "denied";
  policyEvaluations: PolicyEvaluationResult[];
  context: ActionContext;
}

export interface ActionStartedEvent {
  executionId: string;
  sessionId?: string; // Links all events in a workflow
  requestingAgentId: string;
  targetAgentId: string;
  actionType: "skill" | "communication";
  action: string;
  parameters?: Record<string, unknown>;
  context: ActionContext;
  startedAt: string;
}

export interface ActionCompletedEvent {
  executionId: string;
  sessionId?: string; // Links all events in a workflow
  requestingAgentId: string;
  targetAgentId: string;
  action: string;
  status: "completed" | "failed";
  completedAt: string;
  durationMs: number;
  result?: Record<string, unknown>;
  error?: string;
}
