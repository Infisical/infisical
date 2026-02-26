import {
  PolicyEvaluationRequest,
  PolicyEvaluationResponse,
  AgentPolicy,
  GovernanceAuditLog,
  ActionContext,
} from "./types.js";

export interface InfisicalAgentGateConfig {
  baseUrl: string;
  machineIdentityToken: string;
  projectId: string;
}

/**
 * Client for Infisical Agent Arbiter API.
 *
 * This client sends requests to Infisical and gets back policy decisions.
 * When the real Infisical API isn't available, it falls back to mock (for demo purposes).
 */
export class InfisicalAgentGateClient {
  private config: InfisicalAgentGateConfig;
  private useMockFallback: boolean = true;

  constructor(config: InfisicalAgentGateConfig) {
    this.config = config;
  }

  /**
   * Build URL with projectId query parameter
   */
  private buildUrl(path: string): string {
    return `${this.config.baseUrl}${path}?projectId=${encodeURIComponent(this.config.projectId)}`;
  }

  /**
   * Get standard headers for all requests
   */
  private getHeaders(
    includeContentType: boolean = true,
  ): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.machineIdentityToken}`,
    };
    if (includeContentType) {
      headers["Content-Type"] = "application/json";
    }
    return headers;
  }

  /**
   * Check if an agent is allowed to execute its own skill (self-governance).
   * The agent is both the requester and target.
   * Returns auditLogId for tracking execution status.
   */
  async checkSkillPermission(
    agentId: string,
    skillId: string,
    parameters: Record<string, unknown>,
    context: ActionContext,
    agentReasoning?: string,
  ): Promise<PolicyEvaluationResponse> {
    const request: PolicyEvaluationRequest = {
      requestingAgentId: agentId,
      targetAgentId: agentId,
      action: {
        type: "skill",
        skillId,
        parameters,
      },
      context,
      agentReasoning,
    };

    return this.evaluatePolicy(request);
  }

  /**
   * Check if an agent is allowed to communicate with (request something from) another agent.
   * Returns auditLogId for tracking execution status.
   */
  async checkCommunicationPermission(
    requestingAgentId: string,
    targetAgentId: string,
    messageType: string,
    content: Record<string, unknown>,
    context: ActionContext,
    agentReasoning?: string,
  ): Promise<PolicyEvaluationResponse> {
    const request: PolicyEvaluationRequest = {
      requestingAgentId,
      targetAgentId,
      action: {
        type: "communication",
        messageType,
        content,
      },
      context,
      agentReasoning,
    };

    return this.evaluatePolicy(request);
  }

  /**
   * Core policy evaluation - calls Infisical Agent Arbiter API
   * POST /api/v1/agentgate/evaluate?projectId=<project_id>
   * Now returns auditLogId for execution tracking
   */
  private async evaluatePolicy(
    request: PolicyEvaluationRequest,
  ): Promise<PolicyEvaluationResponse> {
    try {
      const response = await fetch(
        this.buildUrl("/api/v1/agentgate/evaluate"),
        {
          method: "POST",
          headers: this.getHeaders(),
          body: JSON.stringify(request),
        },
      );

      if (!response.ok) {
        throw new Error(
          `Infisical API error: ${response.status} ${response.statusText}`,
        );
      }

      const result = (await response.json()) as PolicyEvaluationResponse;
      return result;
    } catch (error) {
      if (this.useMockFallback) {
        console.log(
          `[AgentArbiter] Infisical API unavailable, using mock fallback`,
        );
        return this.mockEvaluatePolicy(request);
      }

      console.error("[AgentArbiter] Policy evaluation failed:", error);
      return {
        allowed: false,
        policyType: "structured",
        policyId: "error_fallback",
        reasoning: `Policy evaluation failed: ${error instanceof Error ? error.message : "Unknown error"}. Defaulting to DENY for safety.`,
        evaluatedAt: new Date().toISOString(),
        auditLogId: "mock-error-" + Date.now(),
      };
    }
  }

  /**
   * Register an agent with Agent Arbiter on startup
   * POST /api/v1/agentgate/agents/register?projectId=<project_id>
   */
  async registerAgent(
    agentId: string,
    declaredSkills: string[],
  ): Promise<{ success: boolean; effectivePermissions: string[] }> {
    try {
      const response = await fetch(
        this.buildUrl("/api/v1/agentgate/agents/register"),
        {
          method: "POST",
          headers: this.getHeaders(),
          body: JSON.stringify({
            agentId,
            declaredSkills,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`Registration failed: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      if (this.useMockFallback) {
        console.log(`[AgentArbiter] Using mock registration for ${agentId}`);
        return { success: true, effectivePermissions: declaredSkills };
      }

      console.error("[AgentArbiter] Agent registration failed:", error);
      return { success: false, effectivePermissions: [] };
    }
  }

  /**
   * Report that an action has started executing.
   * POST /api/v1/agentgate/audit/:auditLogId/start
   */
  async reportActionStarted(auditLogId: string): Promise<void> {
    try {
      const response = await fetch(
        `${this.config.baseUrl}/api/v1/agentgate/audit/${auditLogId}/start`,
        {
          method: "POST",
          headers: this.getHeaders(),
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to report action started: ${response.status}`);
      }
    } catch (error) {
      if (this.useMockFallback) {
        console.log(`[AgentArbiter] Action started: ${auditLogId}`);
      } else {
        console.error("[AgentArbiter] Failed to report action started:", error);
      }
    }
  }

  /**
   * Report that an action has completed (successfully or failed).
   * POST /api/v1/agentgate/audit/:auditLogId/complete
   */
  async reportActionCompleted(
    auditLogId: string,
    data: {
      status: "completed" | "failed";
      result?: Record<string, unknown>;
      error?: string;
    },
  ): Promise<void> {
    try {
      const response = await fetch(
        `${this.config.baseUrl}/api/v1/agentgate/audit/${auditLogId}/complete`,
        {
          method: "POST",
          headers: this.getHeaders(),
          body: JSON.stringify(data),
        },
      );

      if (!response.ok) {
        throw new Error(
          `Failed to report action completed: ${response.status}`,
        );
      }
    } catch (error) {
      if (this.useMockFallback) {
        const icon = data.status === "completed" ? "✓" : "✗";
        console.log(`[AgentArbiter] Action ${icon} ${data.status}: ${auditLogId}`);
      } else {
        console.error(
          "[AgentArbiter] Failed to report action completed:",
          error,
        );
      }
    }
  }

  /**
   * Get agent policy from Infisical
   * GET /api/v1/agentgate/agents/:agentId/policy?projectId=<project_id>
   */
  async getAgentPolicy(agentId: string): Promise<AgentPolicy | null> {
    try {
      const response = await fetch(
        this.buildUrl(
          `/api/v1/agentgate/agents/${encodeURIComponent(agentId)}/policy`,
        ),
        {
          method: "GET",
          headers: this.getHeaders(false),
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to get policy: ${response.status}`);
      }

      return (await response.json()) as AgentPolicy;
    } catch (error) {
      console.error("[AgentArbiter] Failed to get agent policy:", error);
      return null;
    }
  }

  /**
   * List all policies in the project
   * GET /api/v1/agentgate/policies?projectId=<project_id>
   */
  async listPolicies(): Promise<AgentPolicy[]> {
    try {
      const response = await fetch(
        this.buildUrl("/api/v1/agentgate/policies"),
        {
          method: "GET",
          headers: this.getHeaders(false),
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to list policies: ${response.status}`);
      }

      return (await response.json()) as AgentPolicy[];
    } catch (error) {
      console.error("[AgentArbiter] Failed to list policies:", error);
      return [];
    }
  }

  /**
   * Query audit logs
   * GET /api/v1/agentgate/audit?projectId=<project_id>&sessionId=...&agentId=...&result=...
   */
  async queryAuditLogs(options?: {
    sessionId?: string;
    agentId?: string;
    action?: string;
    result?: "allowed" | "denied";
    executionStatus?: "pending" | "started" | "completed" | "failed";
    startTime?: string;
    endTime?: string;
    limit?: number;
    offset?: number;
  }): Promise<GovernanceAuditLog[]> {
    try {
      let url = this.buildUrl("/api/v1/agentgate/audit");

      if (options) {
        const params = new URLSearchParams();
        if (options.sessionId) params.append("sessionId", options.sessionId);
        if (options.agentId) params.append("agentId", options.agentId);
        if (options.action) params.append("action", options.action);
        if (options.result) params.append("result", options.result);
        if (options.executionStatus) params.append("executionStatus", options.executionStatus);
        if (options.startTime) params.append("startTime", options.startTime);
        if (options.endTime) params.append("endTime", options.endTime);
        if (options.limit) params.append("limit", options.limit.toString());
        if (options.offset) params.append("offset", options.offset.toString());

        const extraParams = params.toString();
        if (extraParams) {
          url += `&${extraParams}`;
        }
      }

      const response = await fetch(url, {
        method: "GET",
        headers: this.getHeaders(false),
      });

      if (!response.ok) {
        throw new Error(`Failed to query audit logs: ${response.status}`);
      }

      return (await response.json()) as GovernanceAuditLog[];
    } catch (error) {
      console.error("[AgentArbiter] Failed to query audit logs:", error);
      return [];
    }
  }

  // ============================================================
  // MOCK FALLBACK - Simulates Infisical Agent Arbiter backend
  // In production, ALL of this logic lives in Infisical's backend.
  // ============================================================

  private mockEvaluatePolicy(
    request: PolicyEvaluationRequest,
  ): PolicyEvaluationResponse {
    const { requestingAgentId, targetAgentId, action, context } = request;
    const mockAuditLogId = `mock-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    // Self-governance: agent executing its own skill
    if (action.type === "skill") {
      const result = this.mockEvaluateSelfSkill(
        targetAgentId,
        action.skillId,
        action.parameters,
        context,
      );
      return { ...result, auditLogId: mockAuditLogId };
    }

    // Inter-agent: one agent requesting something from another
    const result = this.mockEvaluateInboundRequest(
      requestingAgentId,
      targetAgentId,
      action.messageType,
      context,
    );
    return { ...result, auditLogId: mockAuditLogId };
  }

  private mockEvaluateSelfSkill(
    agentId: string,
    skillId: string,
    parameters: Record<string, unknown>,
    context: ActionContext,
  ): Omit<PolicyEvaluationResponse, "auditLogId"> {
    const policy = MOCK_AGENT_POLICIES[agentId];
    if (!policy) {
      return {
        allowed: false,
        policyType: "structured",
        policyId: "unknown_agent",
        reasoning: `Unknown agent: ${agentId}`,
        evaluatedAt: new Date().toISOString(),
      };
    }

    if (!policy.selfPolicies.allowedActions.includes(skillId)) {
      return {
        allowed: false,
        policyType: "structured",
        policyId: "self_allowed_actions",
        reasoning: `Action "${skillId}" is not in ${agentId}'s allowed actions.`,
        evaluatedAt: new Date().toISOString(),
      };
    }

    for (const promptPolicy of policy.selfPolicies.promptPolicies) {
      if (promptPolicy.onActions.includes(skillId)) {
        const result = this.mockEvaluatePromptPolicy(
          promptPolicy,
          agentId,
          skillId,
          parameters,
          context,
        );
        if (!result.allowed) {
          return result;
        }
      }
    }

    return {
      allowed: true,
      policyType: "structured",
      policyId: "self_allowed_actions",
      reasoning: `Action "${skillId}" is permitted for ${agentId}.`,
      evaluatedAt: new Date().toISOString(),
    };
  }

  private mockEvaluateInboundRequest(
    requestingAgentId: string,
    targetAgentId: string,
    messageType: string,
    _context: ActionContext,
  ): Omit<PolicyEvaluationResponse, "auditLogId"> {
    const targetPolicy = MOCK_AGENT_POLICIES[targetAgentId];
    if (!targetPolicy) {
      return {
        allowed: false,
        policyType: "structured",
        policyId: "unknown_target",
        reasoning: `Unknown target agent: ${targetAgentId}`,
        evaluatedAt: new Date().toISOString(),
      };
    }

    const inboundPolicy = targetPolicy.inboundPolicies.find(
      (p) => p.fromAgentId === requestingAgentId || p.fromAgentId === "*",
    );

    if (!inboundPolicy) {
      return {
        allowed: false,
        policyType: "structured",
        policyId: "no_inbound_policy",
        reasoning: `${targetAgentId} has no policy allowing requests from ${requestingAgentId}.`,
        evaluatedAt: new Date().toISOString(),
      };
    }

    if (
      !inboundPolicy.allowedToRequest.includes(messageType) &&
      !inboundPolicy.allowedToRequest.includes("*")
    ) {
      return {
        allowed: false,
        policyType: "structured",
        policyId: "inbound_not_allowed",
        reasoning: `${requestingAgentId} is not allowed to request "${messageType}" from ${targetAgentId}.`,
        evaluatedAt: new Date().toISOString(),
      };
    }

    return {
      allowed: true,
      policyType: "structured",
      policyId: "inbound_allowed",
      reasoning: `${requestingAgentId} is permitted to request "${messageType}" from ${targetAgentId}.`,
      evaluatedAt: new Date().toISOString(),
    };
  }

  private mockEvaluatePromptPolicy(
    policy: { id: string; prompt: string; onActions: string[] },
    _agentId: string,
    _skillId: string,
    parameters: Record<string, unknown>,
    context: ActionContext,
  ): Omit<PolicyEvaluationResponse, "auditLogId"> {
    switch (policy.id) {
      case "refund_context_check": {
        const amount =
          (parameters.amount as number) || context.refundAmount || 0;

        if (amount <= 50) {
          return {
            allowed: true,
            policyType: "prompt",
            policyId: policy.id,
            reasoning: `Refund of $${amount} approved — under $50 threshold.`,
            evaluatedAt: new Date().toISOString(),
          };
        }

        if (context.hasEscalationApproval) {
          return {
            allowed: true,
            policyType: "prompt",
            policyId: policy.id,
            reasoning: `Refund of $${amount} approved — escalation approval from ${context.escalationApprovalContext?.approvedBy}.`,
            evaluatedAt: new Date().toISOString(),
          };
        }

        const daysSince = context.daysSinceTicketCreated || 0;
        const loyalty = context.customerLoyaltyStatus || "standard";
        const isWrongItem = context.issueCategory === "shipping";

        if (daysSince >= 7) {
          return {
            allowed: true,
            policyType: "prompt",
            policyId: policy.id,
            reasoning: `Refund of $${amount} approved — customer waited ${daysSince} days.`,
            evaluatedAt: new Date().toISOString(),
          };
        }

        if (isWrongItem && (loyalty === "gold" || loyalty === "platinum")) {
          return {
            allowed: true,
            policyType: "prompt",
            policyId: policy.id,
            reasoning: `Refund of $${amount} approved — wrong-item with ${loyalty} status.`,
            evaluatedAt: new Date().toISOString(),
          };
        }

        return {
          allowed: false,
          policyType: "prompt",
          policyId: policy.id,
          reasoning: `Refund of $${amount} denied — waited ${daysSince} days (need 7), ${loyalty} status (need Gold/Platinum). Escalation required.`,
          evaluatedAt: new Date().toISOString(),
        };
      }

      case "payment_data_access": {
        if (
          context.issueCategory === "billing" &&
          context.issueSeverity === "high"
        ) {
          return {
            allowed: true,
            policyType: "prompt",
            policyId: policy.id,
            reasoning: `Payment info access approved — high-severity billing dispute.`,
            evaluatedAt: new Date().toISOString(),
          };
        }

        return {
          allowed: false,
          policyType: "prompt",
          policyId: policy.id,
          reasoning: `Payment info access denied — investigating ${context.issueCategory || "non-billing"} issue, not billing dispute.`,
          evaluatedAt: new Date().toISOString(),
        };
      }

      case "customer_email_quality": {
        return {
          allowed: true,
          policyType: "prompt",
          policyId: policy.id,
          reasoning: `Email approved — professional tone, complete details.`,
          evaluatedAt: new Date().toISOString(),
        };
      }

      default:
        return {
          allowed: true,
          policyType: "prompt",
          policyId: policy.id,
          reasoning: `Policy ${policy.id} passed.`,
          evaluatedAt: new Date().toISOString(),
        };
    }
  }
}

/**
 * MOCK AGENT POLICIES - Agent-centric policy model
 */
const MOCK_AGENT_POLICIES: Record<
  string,
  {
    selfPolicies: {
      allowedActions: string[];
      promptPolicies: Array<{
        id: string;
        prompt: string;
        onActions: string[];
      }>;
    };
    inboundPolicies: Array<{
      fromAgentId: string;
      allowedToRequest: string[];
      promptPolicies: Array<{
        id: string;
        prompt: string;
        onActions: string[];
      }>;
    }>;
  }
> = {
  triage_agent: {
    selfPolicies: {
      allowedActions: ["classify_ticket", "assess_severity", "route_ticket"],
      promptPolicies: [],
    },
    inboundPolicies: [],
  },

  support_agent: {
    selfPolicies: {
      allowedActions: [
        "lookup_order_history",
        "check_inventory",
        "issue_refund",
        "access_payment_info",
        "compose_response",
        "send_customer_email",
        "request_escalation",
      ],
      promptPolicies: [
        {
          id: "refund_context_check",
          prompt:
            "Allow refunds up to $50. Over $50: allow if waited 7+ days OR wrong-item with Gold/Platinum. Otherwise deny.",
          onActions: ["issue_refund"],
        },
        {
          id: "payment_data_access",
          prompt: "Allow payment info ONLY for high-severity billing disputes.",
          onActions: ["access_payment_info"],
        },
        {
          id: "customer_email_quality",
          prompt:
            "Verify professional tone, complete details, no unverified claims.",
          onActions: ["send_customer_email"],
        },
      ],
    },
    inboundPolicies: [
      {
        fromAgentId: "triage_agent",
        allowedToRequest: ["*"],
        promptPolicies: [],
      },
      {
        fromAgentId: "escalation_agent",
        allowedToRequest: ["*"],
        promptPolicies: [],
      },
      {
        fromAgentId: "fulfillment_agent",
        allowedToRequest: ["*"],
        promptPolicies: [],
      },
    ],
  },

  fulfillment_agent: {
    selfPolicies: {
      allowedActions: [
        "create_shipment",
        "process_return",
        "check_warehouse_inventory",
        "generate_shipping_label",
        "update_tracking",
      ],
      promptPolicies: [],
    },
    inboundPolicies: [
      {
        fromAgentId: "support_agent",
        allowedToRequest: [
          "create_shipment",
          "process_return",
          "check_warehouse_inventory",
        ],
        promptPolicies: [],
      },
    ],
  },

  escalation_agent: {
    selfPolicies: {
      allowedActions: [
        "review_case",
        "approve_refund",
        "override_policy",
        "flag_for_human_review",
      ],
      promptPolicies: [],
    },
    inboundPolicies: [
      {
        fromAgentId: "support_agent",
        allowedToRequest: ["review_case", "approve_refund"],
        promptPolicies: [],
      },
      {
        fromAgentId: "triage_agent",
        allowedToRequest: ["review_case"],
        promptPolicies: [],
      },
    ],
  },
};
