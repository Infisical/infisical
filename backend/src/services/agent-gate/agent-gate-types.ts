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
  agentReasoning?: string;
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
  agentReasoning?: string;
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
    executionStatus?: "pending" | "started" | "completed" | "failed";
    startTime?: string;
    endTime?: string;
  };
  limit?: number;
  offset?: number;
}
