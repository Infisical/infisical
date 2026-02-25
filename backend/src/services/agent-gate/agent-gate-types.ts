import { TInboundPolicy, TSelfPolicies } from "@app/db/schemas";

export interface ActionContext {
  sessionId?: string;
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

export type ActionRequest = SkillInvocationRequest | CommunicationRequest;

export interface PolicyEvaluationRequest {
  requestingAgentId: string;
  targetAgentId: string;
  action: ActionRequest;
  context: ActionContext;
}

export interface LlmEvaluation {
  model: string;
  promptTokens: number;
  completionTokens: number;
  reasoning: string;
}

export interface PolicyEvaluationResult {
  allowed: boolean;
  policyType: "structured" | "prompt";
  policyId: string;
  reasoning: string;
  evaluatedAt: string;
  llmEvaluation?: LlmEvaluation;
}

export interface ActionStartedEvent {
  executionId: string;
  sessionId?: string;
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
  sessionId?: string;
  requestingAgentId: string;
  targetAgentId: string;
  action: string;
  status: "completed" | "failed";
  completedAt: string;
  durationMs: number;
  result?: Record<string, unknown>;
  error?: string;
}

export interface AgentRegistration {
  agentId: string;
  declaredSkills: string[];
}

export interface AgentRegistrationResponse {
  success: boolean;
  effectivePermissions: string[];
}

export interface AgentPolicy {
  agentId: string;
  selfPolicies: TSelfPolicies;
  inboundPolicies: TInboundPolicy[];
}

export interface GovernanceAuditLog {
  sessionId?: string;
  timestamp: string;
  requestingAgentId: string;
  targetAgentId: string;
  actionType: "skill" | "communication";
  action: string;
  result: "allowed" | "denied";
  policyEvaluations: PolicyEvaluationResult[];
  context: ActionContext;
}

export interface TCreateAgentPolicyDTO {
  projectId: string;
  agentId: string;
  selfPolicies: TSelfPolicies;
  inboundPolicies: TInboundPolicy[];
}

export interface TUpdateAgentPolicyDTO {
  projectId: string;
  agentId: string;
  selfPolicies?: TSelfPolicies;
  inboundPolicies?: TInboundPolicy[];
}

export interface TEvaluatePolicyDTO {
  projectId: string;
  request: PolicyEvaluationRequest;
}

export interface TStartExecutionDTO {
  projectId: string;
  event: ActionStartedEvent;
}

export interface TCompleteExecutionDTO {
  projectId: string;
  event: ActionCompletedEvent;
}

export interface TRegisterAgentDTO {
  projectId: string;
  registration: AgentRegistration;
}

export interface TAuditQueryDTO {
  projectId: string;
  filters?: {
    sessionId?: string;
    agentId?: string;
    action?: string;
    result?: "allowed" | "denied";
    startTime?: string;
    endTime?: string;
  };
  limit?: number;
  offset?: number;
}
